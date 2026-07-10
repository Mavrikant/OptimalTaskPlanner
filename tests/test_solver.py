"""Deterministic solver tests: `now` is always injected."""

from datetime import datetime, timedelta

from labplanner.models import Project
from labplanner.solver import solve

NOW = datetime(2026, 7, 6, 7, 0)  # Monday 07:00 -> first free slot = 14
DAY0 = "2026-07-06"


def make_project(equipment, tasks, calendar=None):
    data = {"equipment": equipment, "tasks": tasks}
    if calendar:
        data["calendar"] = calendar
    return Project.model_validate(data)


def make_task(**kw):
    base = {
        "id": kw.get("id", "t1"), "name": kw.get("name", "Task"), "minutes": 120,
        "work_hours_only": False, "continue_next_day": False,
        "resources": {}, "slots": {},
    }
    base.update(kw)
    return base


def segs(schedule, i=0):
    return schedule.tasks[i].segments


def test_work_hours_task_starts_at_work_start():
    p = make_project(
        [{"name": "Rig", "count": 1}],
        [make_task(minutes=120, work_hours_only=True, resources={"Rig": 1})],
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert segs(s)[0].start == f"{DAY0}T08:00"
    assert segs(s)[0].end == f"{DAY0}T10:00"
    assert s.makespan_minutes == 180  # 07:00 -> 10:00


def test_free_running_task_starts_now():
    p = make_project([], [make_task(minutes=60)])
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert segs(s)[0].start == f"{DAY0}T07:00"


def test_half_hour_resolution():
    p = make_project([], [make_task(minutes=30, work_hours_only=True)])
    s = solve(p, now=NOW)
    assert segs(s)[0].start == f"{DAY0}T08:00"
    assert segs(s)[0].end == f"{DAY0}T08:30"


def test_past_deadline_is_infeasible():
    p = make_project(
        [], [make_task(deadline={"date": DAY0, "time": "06:00"})]
    )
    s = solve(p, now=NOW)
    assert s.status == "INFEASIBLE"
    assert "past" in s.message


def test_deadline_constrains_end():
    p = make_project(
        [], [make_task(minutes=60, deadline={"date": DAY0, "time": "08:30"})]
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert segs(s)[0].end <= f"{DAY0}T08:30"


def test_resource_conflict_serialises_tasks():
    p = make_project(
        [{"name": "Rig", "count": 1}],
        [
            make_task(id="a", minutes=120, work_hours_only=True, resources={"Rig": 1}),
            make_task(id="b", minutes=120, work_hours_only=True, resources={"Rig": 1}),
        ],
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    (a,), (b,) = segs(s, 0), segs(s, 1)
    assert a.end_slot <= b.start_slot or b.end_slot <= a.start_slot
    # priority: first task in the list runs first
    assert a.start == f"{DAY0}T08:00"
    assert b.start == f"{DAY0}T10:00"


def test_unavailable_unit_is_never_assigned():
    dates = [(NOW + timedelta(days=d)).date().isoformat() for d in range(14)]
    p = make_project(
        [{
            "name": "Rig", "count": 2,
            "unavailable": {"Rig-1": {d: list(range(48)) for d in dates}},
        }],
        [make_task(minutes=120, work_hours_only=True, resources={"Rig": 1})],
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert s.tasks[0].units == ["Rig-2"]
    assert segs(s)[0].start == f"{DAY0}T08:00"  # not delayed, just re-assigned


def test_holiday_pushes_work_to_next_day():
    p = make_project(
        [], [make_task(minutes=120, work_hours_only=True)],
        calendar={"holidays": [DAY0]},
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert segs(s)[0].start == "2026-07-07T08:00"


def test_custom_work_start_is_respected():
    p = make_project(
        [], [make_task(minutes=120, work_hours_only=True)],
        calendar={"work_start": "09:30", "work_end": "18:00"},
    )
    s = solve(p, now=NOW)
    assert segs(s)[0].start == f"{DAY0}T09:30"


def test_continue_next_day_splits_task():
    p = make_project(
        [], [make_task(minutes=720, work_hours_only=True, continue_next_day=True)],
    )
    s = solve(p, now=NOW)  # 12 h into 10 h work days -> split across two days
    assert s.status == "OPTIMAL"
    parts = segs(s)
    assert len(parts) == 2
    assert parts[0].start == f"{DAY0}T08:00"
    assert parts[0].end == f"{DAY0}T18:00"
    assert parts[1].start == "2026-07-07T08:00"
    assert parts[1].end == "2026-07-07T10:00"


def test_too_long_for_single_day_reports_reason():
    p = make_project([], [make_task(minutes=720, work_hours_only=True)])
    s = solve(p, now=NOW)
    assert s.status == "INFEASIBLE"
    assert "continue on next day" in s.message


def test_task_unavailable_slots_delay_start():
    # 07:00-09:00 painted unavailable (slots 14..17) -> task starts 09:00
    p = make_project(
        [], [make_task(minutes=60, slots={DAY0: {str(x): "unavailable" for x in range(14, 18)}})],
    )
    s = solve(p, now=NOW)
    assert segs(s)[0].start == f"{DAY0}T09:00"


def test_preferred_slots_win_within_makespan():
    # Task a (8 h) drives the makespan; task b (1 h) can sit anywhere before 15:00,
    # preference pulls it to 10:00 even though earlier starts exist.
    p = make_project(
        [],
        [
            make_task(id="a", minutes=480),
            make_task(id="b", minutes=60,
                      slots={DAY0: {"20": "preferred", "21": "preferred"}}),
        ],
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert segs(s, 1)[0].start == f"{DAY0}T10:00"


def test_earliest_start_delays_task():
    p = make_project(
        [], [make_task(minutes=60, earliest_start={"date": "2026-07-07", "time": "10:00"})]
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert segs(s)[0].start == "2026-07-07T10:00"


def test_earliest_start_in_past_has_no_effect():
    p = make_project(
        [], [make_task(minutes=60, earliest_start={"date": "2026-07-01", "time": "08:00"})]
    )
    s = solve(p, now=NOW)
    assert segs(s)[0].start == f"{DAY0}T07:00"  # now wins


def test_earliest_start_after_deadline_is_infeasible():
    p = make_project(
        [], [make_task(minutes=120,
                       earliest_start={"date": DAY0, "time": "10:00"},
                       deadline={"date": DAY0, "time": "11:00"})]
    )
    s = solve(p, now=NOW)
    assert s.status == "INFEASIBLE"
    assert "earliest start" in s.message


def test_custom_unit_names_used_in_assignment():
    dates = [(NOW + timedelta(days=d)).date().isoformat() for d in range(14)]
    p = make_project(
        [{
            "name": "Rig", "count": 2, "unit_names": ["Alpha", "Beta"],
            "unavailable": {"Alpha": {d: list(range(48)) for d in dates}},
        }],
        [make_task(minutes=120, work_hours_only=True, resources={"Rig": 1})],
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert s.tasks[0].units == ["Beta"]


def test_precheck_unknown_equipment():
    p = make_project([], [make_task(resources={"Ghost": 1})])
    s = solve(p, now=NOW)
    assert s.status == "INFEASIBLE"
    assert "unknown equipment" in s.message


def test_precheck_demand_exceeds_pool():
    p = make_project(
        [{"name": "Rig", "count": 1}],
        [make_task(resources={"Rig": 2})],
    )
    s = solve(p, now=NOW)
    assert s.status == "INFEASIBLE"
    assert "only 1 exist" in s.message


def test_empty_project_is_trivially_optimal():
    s = solve(make_project([], []), now=NOW)
    assert s.status == "OPTIMAL"
    assert s.makespan_minutes == 0
    assert s.tasks == []
