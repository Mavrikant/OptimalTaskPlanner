from labplanner.models import Project
from labplanner.storage import ProjectStore, default_project


def test_first_load_creates_default_project(tmp_path):
    store = ProjectStore(tmp_path / "data")
    project = store.load()
    assert store.path.exists()
    assert project.equipment
    assert project.tasks


def test_save_load_roundtrip(tmp_path):
    store = ProjectStore(tmp_path)
    project = default_project()
    project.calendar.work_start = "09:00"
    project.calendar.holidays = ["2026-07-15"]
    project.equipment[0].unavailable = {"VSG-1": {"2026-07-08": [16, 17]}}
    store.save(project)

    loaded = store.load()
    assert loaded == project


def test_atomic_write_leaves_no_tmp_files(tmp_path):
    store = ProjectStore(tmp_path)
    store.save(default_project())
    store.save(default_project())
    leftovers = [p for p in tmp_path.iterdir() if p.suffix == ".tmp"]
    assert leftovers == []


def test_load_validates_against_model(tmp_path):
    store = ProjectStore(tmp_path)
    store.save(default_project())
    assert isinstance(store.load(), Project)
