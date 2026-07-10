import pytest
from pydantic import ValidationError

from labplanner.models import (
    EquipmentType,
    Task,
    WorkCalendar,
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
