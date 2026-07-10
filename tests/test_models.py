import pytest
from pydantic import ValidationError

from labplanner.models import (
    SCHEMA_VERSION,
    EquipmentType,
    Project,
    SolverOptions,
    Task,
    WorkCalendar,
    equipment_units,
    hhmm_to_slot,
    slot_to_hhmm,
)


def make_task(**kw):
    base = {"id": "t1", "name": "T", "minutes": 60}
    base.update(kw)
    return Task.model_validate(base)


def test_hhmm_roundtrip():
    assert hhmm_to_slot("00:00") == 0
    assert hhmm_to_slot("08:30") == 17
    assert hhmm_to_slot("24:00") == 48
    for s in range(48):
        assert hhmm_to_slot(slot_to_hhmm(s)) == s


@pytest.mark.parametrize("bad", ["08:15", "25:00", "24:30", "8h", ""])
def test_hhmm_rejects_bad_input(bad):
    with pytest.raises(ValueError):
        hhmm_to_slot(bad)


def test_task_minutes_must_be_slot_aligned():
    with pytest.raises(ValidationError):
        make_task(minutes=45)
    with pytest.raises(ValidationError):
        make_task(minutes=0)
    assert make_task(minutes=30).duration_slots == 1
    assert make_task(minutes=90).duration_slots == 3


def test_task_slot_states_validated():
    with pytest.raises(ValidationError):
        make_task(slots={"2026-07-06": {"10": "busy"}})
    task = make_task(slots={"2026-07-06": {"10": "preferred", "11": "unavailable"}})
    assert task.slots["2026-07-06"]["10"] == "preferred"


def test_work_calendar_validation():
    cal = WorkCalendar(work_start="08:30", work_end="17:00",
                       holidays=["2026-07-15", "2026-07-15", "2026-01-01"])
    assert cal.work_start_slot == 17
    assert cal.work_end_slot == 34
    assert cal.holidays == ["2026-01-01", "2026-07-15"]  # deduped + sorted
    with pytest.raises(ValidationError):
        WorkCalendar(work_start="18:00", work_end="08:00")
    with pytest.raises(ValidationError):
        WorkCalendar(work_start="08:15")
    with pytest.raises(ValidationError):
        WorkCalendar(holidays=["not-a-date"])


def test_equipment_unavailable_slot_range():
    with pytest.raises(ValidationError):
        EquipmentType(name="VSG", count=2, unavailable={"VSG-1": {"2026-07-06": [48]}})
    eq = EquipmentType(name="VSG", count=2, unavailable={"VSG-1": {"2026-07-06": [0, 47]}})
    assert eq.unavailable["VSG-1"]["2026-07-06"] == [0, 47]


def test_unit_names_validation():
    with pytest.raises(ValidationError):
        EquipmentType(name="VSG", count=2, unit_names=["A"])  # wrong length
    with pytest.raises(ValidationError):
        EquipmentType(name="VSG", count=2, unit_names=["A", "A"])  # duplicate
    with pytest.raises(ValidationError):
        EquipmentType(name="VSG", count=2, unit_names=["A", "  "])  # blank
    eq = EquipmentType(name="VSG", count=2, unit_names=[" Alpha ", "Beta"])
    assert equipment_units(eq) == ["Alpha", "Beta"]


def test_default_unit_naming():
    assert equipment_units(EquipmentType(name="OBB", count=1)) == ["OBB"]
    assert equipment_units(EquipmentType(name="VSG", count=3)) == ["VSG-1", "VSG-2", "VSG-3"]


def test_project_rejects_duplicate_unit_names_across_types():
    with pytest.raises(ValidationError):
        Project.model_validate({"equipment": [
            {"name": "A", "count": 2, "unit_names": ["X", "Y"]},
            {"name": "B", "count": 1, "unit_names": ["X"]},
        ]})


def test_task_earliest_start_validation():
    with pytest.raises(ValidationError):
        make_task(earliest_start={"date": "2026-07-06", "time": "10:15"})
    task = make_task(earliest_start={"date": "2026-07-06", "time": "10:30"})
    assert task.earliest_start.slot_of_day == 21


def test_task_pinned_start_validation():
    with pytest.raises(ValidationError):
        make_task(pinned_start={"date": "2026-07-06", "time": "10:15"})
    task = make_task(pinned_start={"date": "2026-07-06", "time": "10:30"})
    assert task.pinned_start.slot_of_day == 21


def test_solver_options_defaults_and_bounds():
    assert Project(name="x").solver == SolverOptions(time_limit_s=20, workers=8, days=14)
    for bad in [{"time_limit_s": 4}, {"time_limit_s": 121},
                {"workers": 0}, {"workers": 17}, {"days": 0}, {"days": 32}]:
        with pytest.raises(ValidationError):
            SolverOptions(**bad)


def test_project_defaults_to_current_schema_version():
    assert Project(name="x").schema_version == SCHEMA_VERSION


def test_task_self_dependency_rejected():
    with pytest.raises(ValidationError):
        make_task(id="x", depends_on=["x"])
    task = make_task(id="x", depends_on=["y", "y", "z"])
    assert task.depends_on == ["y", "z"]  # deduped, order kept


def test_task_status_validation():
    assert make_task().status == "pending"
    assert make_task(status="in_progress").status == "in_progress"
    assert make_task(status="done").status == "done"
    with pytest.raises(ValidationError):
        make_task(status="paused")
