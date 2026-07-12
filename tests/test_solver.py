"""Deterministic solver tests: `now` is always injected."""

from datetime import datetime, timedelta

from optimal_task_planner.models import Project, Schedule, ScheduledTask, ScheduleSegment
from optimal_task_planner.solver import solve

NOW = datetime(2026, 7, 6, 7, 0)  # Monday 07:00 -> first free slot = 14
DAY0 = "2026-07-06"


def make_project(equipment, tasks, calendar=None):
    data = {"equipment": equipment, "tasks": tasks}
    if calendar:
        data["calendar"] = calendar
    return Project.model_validate(data)


def make_task(**kw):
    base = {
        "id": kw.get("id", "t1"),
        "name": kw.get("name", "Task"),
        "minutes": 120,
        "work_hours_only": False,
        "continue_next_day": False,
        "resources": {},
        "slots": {},
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
    p = make_project([], [make_task(deadline={"date": DAY0, "time": "06:00"})])
    s = solve(p, now=NOW)
    assert s.status == "INFEASIBLE"
    assert "past" in s.message


def test_deadline_constrains_end():
    p = make_project([], [make_task(minutes=60, deadline={"date": DAY0, "time": "08:30"})])
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
        [
            {
                "name": "Rig",
                "count": 2,
                "unavailable": {"Rig-1": {d: list(range(48)) for d in dates}},
            }
        ],
        [make_task(minutes=120, work_hours_only=True, resources={"Rig": 1})],
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert s.tasks[0].units == ["Rig-2"]
    assert segs(s)[0].start == f"{DAY0}T08:00"  # not delayed, just re-assigned


def test_holiday_pushes_work_to_next_day():
    p = make_project(
        [],
        [make_task(minutes=120, work_hours_only=True)],
        calendar={"holidays": [DAY0]},
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert segs(s)[0].start == "2026-07-07T08:00"


def test_custom_work_start_is_respected():
    p = make_project(
        [],
        [make_task(minutes=120, work_hours_only=True)],
        calendar={"work_start": "09:30", "work_end": "18:00"},
    )
    s = solve(p, now=NOW)
    assert segs(s)[0].start == f"{DAY0}T09:30"


def test_continue_next_day_splits_task():
    p = make_project(
        [],
        [make_task(minutes=720, work_hours_only=True, continue_next_day=True)],
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
        [],
        [make_task(minutes=60, slots={DAY0: {str(x): "unavailable" for x in range(14, 18)}})],
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
            make_task(id="b", minutes=60, slots={DAY0: {"20": "preferred", "21": "preferred"}}),
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
        [],
        [
            make_task(
                minutes=120,
                earliest_start={"date": DAY0, "time": "10:00"},
                deadline={"date": DAY0, "time": "11:00"},
            )
        ],
    )
    s = solve(p, now=NOW)
    assert s.status == "INFEASIBLE"
    assert "earliest start" in s.message


def test_custom_unit_names_used_in_assignment():
    dates = [(NOW + timedelta(days=d)).date().isoformat() for d in range(14)]
    p = make_project(
        [
            {
                "name": "Rig",
                "count": 2,
                "unit_names": ["Alpha", "Beta"],
                "unavailable": {"Alpha": {d: list(range(48)) for d in dates}},
            }
        ],
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


def test_dependency_orders_tasks():
    p = make_project(
        [],
        [
            make_task(id="a", minutes=120),
            make_task(id="b", minutes=60, depends_on=["a"]),
        ],
    )
    s = solve(p, now=NOW)
    assert s.status == "OPTIMAL"
    assert segs(s, 1)[0].start_slot >= segs(s, 0)[-1].end_slot


def test_dependency_cycle_is_detected():
    p = make_project(
        [],
        [
            make_task(id="a", depends_on=["b"]),
            make_task(id="b", depends_on=["a"]),
        ],
    )
    s = solve(p, now=NOW)
    assert s.status == "INFEASIBLE"
    assert "Dependency cycle" in s.message


def test_pinned_start_is_exact():
    p = make_project([], [make_task(minutes=60, pinned_start={"date": DAY0, "time": "10:00"})])
    s = solve(p, now=NOW)  # a free task would otherwise start at 07:00
    assert s.status == "OPTIMAL"
    assert segs(s)[0].start == f"{DAY0}T10:00"


def test_impossible_pin_reports_reason():
    # pinned on a Saturday for a work-hours-only task
    p = make_project(
        [],
        [
            make_task(
                minutes=60,
                work_hours_only=True,
                pinned_start={"date": "2026-07-11", "time": "10:00"},
            )
        ],
    )
    s = solve(p, now=NOW)
    assert s.status == "INFEASIBLE"
    assert "pinned start" in s.message


def test_done_task_is_excluded():
    p = make_project([], [make_task(id="a", status="done"), make_task(id="b")])
    s = solve(p, now=NOW)
    assert [x.task_id for x in s.tasks] == ["b"]


def test_in_progress_task_is_frozen_to_previous_place():
    p = make_project(
        [{"name": "Rig", "count": 2}],
        [make_task(id="a", minutes=120, resources={"Rig": 1}, status="in_progress")],
    )
    p.schedule = Schedule(
        status="OPTIMAL",
        horizon_start=DAY0,
        tasks=[
            ScheduledTask(
                task_id="a",
                task_name="Task",
                units=["Rig-2"],
                segments=[
                    ScheduleSegment(
                        start=f"{DAY0}T09:00", end=f"{DAY0}T11:00", start_slot=18, end_slot=22
                    )
                ],
            )
        ],
    )
    s = solve(p, now=NOW)  # a pending task would be pulled forward to 07:00
    assert s.status == "OPTIMAL"
    assert segs(s)[0].start == f"{DAY0}T09:00"
    assert s.tasks[0].units == ["Rig-2"]


def test_in_progress_task_finished_in_past_is_skipped():
    p = make_project(
        [], [make_task(id="a", minutes=60, status="in_progress"), make_task(id="b", minutes=60)]
    )
    p.schedule = Schedule(
        status="OPTIMAL",
        horizon_start="2026-07-05",
        tasks=[
            ScheduledTask(
                task_id="a",
                task_name="T",
                units=[],
                segments=[
                    ScheduleSegment(
                        start="2026-07-05T08:00", end="2026-07-05T09:00", start_slot=16, end_slot=18
                    )
                ],
            )
        ],
    )
    s = solve(p, now=NOW)
    assert [x.task_id for x in s.tasks] == ["b"]


def _assert_no_double_booking(schedule):
    by_unit = {}
    for stt in schedule.tasks:
        for u in stt.units:
            for seg in stt.segments:
                by_unit.setdefault(u, []).append((seg.start_slot, seg.end_slot))
    for u, intervals in by_unit.items():
        intervals.sort()
        for i in range(1, len(intervals)):
            assert intervals[i][0] >= intervals[i - 1][1], f"unit {u} is double-booked: {intervals}"


def test_large_project_solves_without_double_booking():
    """A big model must stay solvable (pruned conflict encoding) and correct."""
    equipment = [
        {"name": "Rig", "count": 6},
        {"name": "Bench", "count": 4},
        {"name": "Chamber", "count": 2},
    ]
    types = ["Rig", "Bench", "Chamber"]
    tasks = []
    for i in range(40):
        rtype = types[i % 3]
        tasks.append(
            make_task(
                id=f"t{i}",
                name=f"Task {i}",
                minutes=60 + (i % 4) * 60,  # 1–4 h
                work_hours_only=(i % 2 == 0),
                resources={rtype: 1 + (i % 2 if rtype == "Rig" else 0)},  # some need 2 Rigs
            )
        )
    # generous cap: this is a ceiling CP-SAT rarely needs in full, not a target —
    # a tight one made this test flaky on slower/shared CI runners (times out
    # before finding any solution, reported as INFEASIBLE instead of UNKNOWN)
    s = solve(make_project(equipment, tasks), now=NOW, time_limit_s=60.0)
    assert s.status in ("OPTIMAL", "FEASIBLE")
    assert len(s.tasks) == 40
    _assert_no_double_booking(s)


def test_progress_callback_reports_a_live_schedule_snapshot():
    """The Schedule tab shows in-progress solutions — progress() must carry one."""
    p = make_project(
        [{"name": "Rig", "count": 2}],
        [
            make_task(id="a", name="Alpha", minutes=60, resources={"Rig": 1}),
            make_task(id="b", name="Beta", minutes=90, resources={"Rig": 1}),
        ],
    )
    calls = []
    s = solve(p, now=NOW, progress=lambda mk, snapshot: calls.append((mk, snapshot)))
    assert s.status in ("OPTIMAL", "FEASIBLE")
    assert calls, "expected at least one progress callback for a solvable model"
    for mk, snapshot in calls:
        assert isinstance(mk, int)
        assert {st.task_id for st in snapshot} == {"a", "b"}
        for st in snapshot:
            assert st.segments  # every task in a solution snapshot occupies real slots
    # the last reported makespan must agree with the final result — same
    # extraction code path, just fed a different (the winning) solution
    last_mk, last_snapshot = calls[-1]
    assert last_mk == s.makespan_minutes
    assert {st.task_id for st in last_snapshot} == {t.task_id for t in s.tasks}


def test_infeasible_hint_names_the_blocking_deadline():
    # both tasks need the single Rig inside the same one-hour deadline window
    p = make_project(
        [{"name": "Rig", "count": 1}],
        [
            make_task(
                id="a",
                name="Alpha",
                minutes=60,
                work_hours_only=True,
                resources={"Rig": 1},
                deadline={"date": DAY0, "time": "09:00"},
            ),
            make_task(
                id="b",
                name="Beta",
                minutes=60,
                work_hours_only=True,
                resources={"Rig": 1},
                deadline={"date": DAY0, "time": "09:00"},
            ),
        ],
    )
    s = solve(p, now=NOW)
    assert s.status == "INFEASIBLE"
    assert s.hints, "expected at least one relaxation hint"
    assert any("deadline of task" in h for h in s.hints)
