from datetime import datetime

from optimal_task_planner.calendar_utils import build_work_mask, first_free_slot, horizon_start
from optimal_task_planner.models import SLOTS_PER_DAY, WorkCalendar

MONDAY = datetime(2026, 7, 6)  # a Monday


def test_first_free_slot_rounds_up_to_next_boundary():
    assert first_free_slot(datetime(2026, 7, 6, 10, 0)) == 20
    assert first_free_slot(datetime(2026, 7, 6, 10, 0, 1)) == 21
    assert first_free_slot(datetime(2026, 7, 6, 10, 1)) == 21
    assert first_free_slot(datetime(2026, 7, 6, 10, 30)) == 21
    assert first_free_slot(datetime(2026, 7, 6, 10, 31)) == 22


def test_horizon_start_is_midnight():
    assert horizon_start(datetime(2026, 7, 6, 15, 42)) == MONDAY


def test_work_mask_default_hours():
    mask = build_work_mask(MONDAY, 14, WorkCalendar())
    assert len(mask) == 14 * SLOTS_PER_DAY
    # Monday: 08:00-18:00 -> slots 16..35
    assert mask[15] is False
    assert all(mask[16:36])
    assert mask[36] is False
    # Saturday (day 5) fully off
    sat = 5 * SLOTS_PER_DAY
    assert not any(mask[sat : sat + SLOTS_PER_DAY])


def test_work_mask_respects_holidays_and_custom_start():
    cal = WorkCalendar(work_start="08:30", work_end="12:00", holidays=["2026-07-07"])
    mask = build_work_mask(MONDAY, 14, cal)
    # Monday starts at 08:30 (slot 17)
    assert mask[16] is False
    assert mask[17] is True
    assert mask[23] is True  # 11:30
    assert mask[24] is False  # 12:00 is exclusive
    # Tuesday 2026-07-07 is a holiday -> fully off
    tue = 1 * SLOTS_PER_DAY
    assert not any(mask[tue : tue + SLOTS_PER_DAY])
