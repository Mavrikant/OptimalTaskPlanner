import json
import logging
import threading

import pytest
from pydantic import ValidationError

from optimal_task_planner.models import SCHEMA_VERSION, Project
from optimal_task_planner.storage import BACKUP_KEEP, ProjectStore, default_project, migrate


@pytest.fixture
def store(tmp_path):
    return ProjectStore(tmp_path / "data")


def test_ensure_default_seeds_a_sample_project(store):
    store.ensure_default()
    projects = store.list_projects()
    assert len(projects) == 1
    project = store.load(projects[0]["id"])
    assert project.equipment
    assert project.tasks
    assert project.schema_version == SCHEMA_VERSION


def test_crud_roundtrip(store):
    pid = store.create("Alpha")
    project = store.load(pid)
    assert project.name == "Alpha"

    project.calendar.work_start = "09:00"
    store.save(pid, project)
    assert store.load(pid).calendar.work_start == "09:00"

    listed = store.list_projects()
    assert [p["id"] for p in listed] == [pid]
    assert listed[0]["name"] == "Alpha"

    store.delete(pid)
    assert store.list_projects() == []
    with pytest.raises(FileNotFoundError):
        store.load(pid)


def test_projects_are_isolated(store):
    a = store.create("A", default_project("A"))
    b = store.create("B")
    pa = store.load(a)
    pa.tasks[0].name = "changed only in A"
    store.save(a, pa)
    assert store.load(b).tasks == Project(name="B").tasks


def test_duplicate_copies_content_with_new_id(store):
    a = store.create("Lab", default_project("Lab"))
    b = store.duplicate(a)
    assert b != a
    copy = store.load(b)
    assert copy.name == "Lab (copy)"
    assert [t.name for t in copy.tasks] == [t.name for t in store.load(a).tasks]


def test_import_validates_and_creates(store):
    pid = store.import_data(default_project("Imported").model_dump())
    assert store.load(pid).name == "Imported"
    with pytest.raises(ValidationError):
        store.import_data({"tasks": [{"id": "x", "name": "bad", "minutes": 45}]})


def test_legacy_single_file_is_migrated_losslessly(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    legacy_project = default_project("Legacy lab")
    raw = legacy_project.model_dump()
    del raw["name"]  # pre-v2 files had neither field
    del raw["schema_version"]
    (data_dir / "project.json").write_text(json.dumps(raw), encoding="utf-8")

    store = ProjectStore(data_dir)
    store.ensure_default()

    projects = store.list_projects()
    assert len(projects) == 1
    migrated = store.load(projects[0]["id"])
    assert [t.name for t in migrated.tasks] == [t.name for t in legacy_project.tasks]
    assert migrated.schema_version == SCHEMA_VERSION
    assert not (data_dir / "project.json").exists()
    assert (data_dir / "project.json.migrated").exists()
    # a safety snapshot of the migrated content exists
    assert store.list_backups(projects[0]["id"])


def test_migrate_chain_fills_missing_fields():
    raw = {"equipment": [], "tasks": []}
    migrated = migrate(raw)
    assert migrated["name"] == "My lab"
    assert migrated["schema_version"] == SCHEMA_VERSION


def test_v2_project_gains_default_solver_options(tmp_path):
    store = ProjectStore(tmp_path)
    pid = store.create("Legacy v2")
    # simulate a v2 file on disk: no solver, schema_version 2
    path = store._path(pid)
    raw = json.loads(path.read_text(encoding="utf-8"))
    raw.pop("solver", None)
    raw["schema_version"] = 2
    path.write_text(json.dumps(raw), encoding="utf-8")

    loaded = store.load(pid)
    assert loaded.schema_version == SCHEMA_VERSION
    assert loaded.solver.days == 14 and loaded.solver.time_limit_s == 20


def test_backups_created_pruned_and_restored(store, monkeypatch):
    pid = store.create("B", default_project("B"))
    project = store.load(pid)

    # force-time snapshots beyond the cap
    for _ in range(BACKUP_KEEP + 5):
        store._snapshot(pid, force=True)
    assert len(store.list_backups(pid)) == BACKUP_KEEP

    # newest backup holds the current content; then change and restore
    original_start = project.calendar.work_start
    project.calendar.work_start = "10:00"
    store._write(pid, project)
    name = store.list_backups(pid)[0]["name"]
    store.restore_backup(pid, name)
    assert store.load(pid).calendar.work_start == original_start


def test_restore_rejects_bad_names(store):
    pid = store.create("X")
    with pytest.raises(FileNotFoundError):
        store.restore_backup(pid, "..\\..\\evil.json")
    with pytest.raises(FileNotFoundError):
        store.restore_backup(pid, "nope.json")


def test_save_missing_project_raises(store):
    with pytest.raises(FileNotFoundError):
        store.save("doesnotexist", Project(name="x"))


def test_concurrent_writes_never_corrupt_the_file(store):
    """_write's tempfile+os.replace must stay atomic under concurrent writers."""
    pid = store.create("Race")
    n = 16
    barrier = threading.Barrier(n)

    def write(i: int) -> None:
        project = store.load(pid)
        project.calendar.work_start = f"{6 + i % 12:02d}:00"
        barrier.wait()  # maximise overlap
        store.save(pid, project)

    threads = [threading.Thread(target=write, args=(i,)) for i in range(n)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # the file must always be one writer's complete, valid content — never a
    # torn/interleaved mix of two writes
    raw = json.loads(store._path(pid).read_text(encoding="utf-8"))
    assert raw["calendar"]["work_start"] in {f"{6 + i % 12:02d}:00" for i in range(n)}
    loaded = store.load(pid)  # re-validates against the schema
    assert loaded.calendar.work_start == raw["calendar"]["work_start"]


def test_ensure_default_recovers_from_corrupt_legacy_file(tmp_path, caplog):
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    (data_dir / "project.json").write_text("{not valid json", encoding="utf-8")

    store = ProjectStore(data_dir)
    with caplog.at_level(logging.ERROR):
        store.ensure_default()  # must not raise

    assert (data_dir / "project.json.corrupted").exists()
    assert not (data_dir / "project.json").exists()
    projects = store.list_projects()
    assert len(projects) == 1
    assert store.load(projects[0]["id"]).name == "My lab"
    assert "corrupt" in caplog.text


def test_migrate_future_schema_version_does_not_crash(caplog):
    raw = {"name": "From the future", "equipment": [], "tasks": [], "schema_version": 999}
    with caplog.at_level(logging.WARNING):
        migrated = migrate(raw)
    # current behavior: downgraded to what this build understands, with a warning
    assert migrated["schema_version"] == SCHEMA_VERSION
    assert "newer than this build supports" in caplog.text
