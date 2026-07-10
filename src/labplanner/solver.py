"""CP-SAT scheduling over a rolling horizon of 30-minute slots.

Approach: for every task, enumerate all feasible start slots and the exact
set of slots each start would occupy (this cleanly handles work-hours-only
tasks and the continue-on-next-day split). CP-SAT then picks one start per
task and assigns physical units so no unit is used by two tasks in the same
slot, and never during a unit's unavailability windows. The objective is
lexicographic via weights:
  1. makespan  2. preferred-slot usage  3. priority (list order).
"""

from __future__ import annotations

import time
from datetime import date, datetime, timedelta

from ortools.sat.python import cp_model

from .calendar_utils import build_work_mask, first_free_slot, horizon_start
from .models import (
    SLOT_MINUTES,
    SLOTS_PER_DAY,
    Project,
    Schedule,
    ScheduledTask,
    ScheduleSegment,
    Task,
)


def slot_state(task: Task, start: datetime, s: int) -> str:
    day = (start + timedelta(days=s // SLOTS_PER_DAY)).date().isoformat()
    return task.slots.get(day, {}).get(str(s % SLOTS_PER_DAY), "")


def deadline_slot(task: Task, start: datetime) -> int | None:
    if not task.deadline:
        return None
    try:
        d = date.fromisoformat(task.deadline.date)
    except ValueError:
        return None
    return (d - start.date()).days * SLOTS_PER_DAY + task.deadline.slot_of_day


def _hours(slots: int) -> str:
    return f"{slots * SLOT_MINUTES / 60:g}"


def candidate_starts(
    task: Task, start: datetime, work: list[bool], now_slot: int, horizon: int
) -> tuple[list[tuple[int, list[int]]], str]:
    """Return ``([(start_slot, occupied_slots)], reason_if_empty)``."""
    dur = task.duration_slots
    blocked = {s for s in range(horizon) if slot_state(task, start, s) == "unavailable"}
    dl = deadline_slot(task, start)
    if dl is not None and dl <= now_slot:
        return [], (
            f"deadline {task.deadline.date} {task.deadline.time} is already in the past"
        )

    cands: list[tuple[int, list[int]]] = []
    if task.work_hours_only:
        if task.continue_next_day:
            wh = [s for s in range(horizon) if work[s]]
            if dur > len(wh):
                return [], (
                    f"needs {_hours(dur)} work hours but only {_hours(len(wh))} exist "
                    f"in the {horizon // SLOTS_PER_DAY}-day horizon"
                )
            for i in range(len(wh) - dur + 1):
                occ = wh[i : i + dur]
                if occ[0] < now_slot:
                    continue
                if blocked.intersection(occ):
                    continue
                if dl is not None and occ[-1] + 1 > dl:
                    continue
                cands.append((occ[0], occ))
        else:
            n_days = horizon // SLOTS_PER_DAY
            day_len = max(
                (sum(work[d * SLOTS_PER_DAY + s] for s in range(SLOTS_PER_DAY))
                 for d in range(n_days)),
                default=0,
            )
            if dur > day_len:
                return [], (
                    f"{_hours(dur)} h does not fit in a single work day "
                    f"({_hours(day_len)} h) — enable 'continue on next day'"
                )
            for d in range(n_days):
                base = d * SLOTS_PER_DAY
                day_slots = [s for s in range(SLOTS_PER_DAY) if work[base + s]]
                if not day_slots:
                    continue  # weekend or holiday
                first, last = day_slots[0], day_slots[-1]
                for s in range(first, last - dur + 2):
                    k = base + s
                    occ = list(range(k, k + dur))
                    if k < now_slot or blocked.intersection(occ):
                        continue
                    if dl is not None and occ[-1] + 1 > dl:
                        continue
                    cands.append((k, occ))
    else:
        for k in range(max(now_slot, 0), horizon - dur + 1):
            occ = list(range(k, k + dur))
            if blocked.intersection(occ):
                continue
            if dl is not None and occ[-1] + 1 > dl:
                continue
            cands.append((k, occ))

    if not cands:
        return [], "no feasible start slot (check deadline, unavailable hours and duration)"
    return cands, ""


def expand_units(project: Project) -> dict[str, list[str]]:
    """type name -> [unit names]  (VSG x3 -> VSG-1..VSG-3)."""
    pool: dict[str, list[str]] = {}
    for eq in project.equipment:
        if eq.count == 1:
            pool[eq.name] = [eq.name]
        else:
            pool[eq.name] = [f"{eq.name}-{i + 1}" for i in range(eq.count)]
    return pool


def unit_unavailability(project: Project, start: datetime, days: int) -> dict[str, set[int]]:
    """unit name -> set of absolute slots where the unit is out of service."""
    valid_units = {u for units in expand_units(project).values() for u in units}
    out: dict[str, set[int]] = {}
    for eq in project.equipment:
        for unit, by_date in eq.unavailable.items():
            if unit not in valid_units:
                continue  # stale entry, e.g. count was reduced
            for iso, slots in by_date.items():
                try:
                    d = date.fromisoformat(iso)
                except ValueError:
                    continue
                offset = (d - start.date()).days
                if 0 <= offset < days:
                    base = offset * SLOTS_PER_DAY
                    out.setdefault(unit, set()).update(
                        base + s for s in slots if 0 <= s < SLOTS_PER_DAY
                    )
    return out


def precheck(project: Project) -> list[str]:
    errors = []
    counts = {eq.name: eq.count for eq in project.equipment}
    for t in project.tasks:
        for rtype, qty in t.resources.items():
            if qty <= 0:
                continue
            if rtype not in counts:
                errors.append(f"Task '{t.name}' needs unknown equipment '{rtype}'")
            elif qty > counts[rtype]:
                errors.append(
                    f"Task '{t.name}' needs {qty} x {rtype} but only {counts[rtype]} exist"
                )
    return errors


def solve(
    project: Project,
    days: int = 14,
    now: datetime | None = None,
    time_limit_s: float = 20.0,
) -> Schedule:
    now = now or datetime.now()
    start = horizon_start(now)
    now_slot = first_free_slot(now)
    horizon = days * SLOTS_PER_DAY
    work = build_work_mask(start, days, project.calendar)

    errors = precheck(project)
    if errors:
        return Schedule(
            status="INFEASIBLE",
            message="; ".join(errors),
            horizon_start=start.date().isoformat(),
        )

    tasks = project.tasks
    if not tasks:
        return Schedule(
            status="OPTIMAL",
            message="No tasks to schedule.",
            horizon_start=start.date().isoformat(),
            solved_at=now.isoformat(timespec="seconds"),
            makespan_minutes=0,
            solve_time_s=0.0,
            tasks=[],
        )

    all_cands: list[list[tuple[int, list[int]]]] = []
    for t in tasks:
        cands, reason = candidate_starts(t, start, work, now_slot, horizon)
        if not cands:
            return Schedule(
                status="INFEASIBLE",
                message=f"Task '{t.name}': {reason}",
                horizon_start=start.date().isoformat(),
            )
        all_cands.append(cands)

    pool = expand_units(project)
    unavail = unit_unavailability(project, start, days)
    model = cp_model.CpModel()
    n = len(tasks)

    # weights for lexicographic objective
    w_prio_max = n * n * horizon + 1        # dominate priority term
    w_pref = w_prio_max                     # per preferred slot
    total_dur = sum(t.duration_slots for t in tasks)
    w_makespan = w_pref * (total_dur + 1)   # dominate preference term

    b = []          # b[t][j] candidate selected
    x = []          # x[t] : dict slot -> BoolVar occupancy
    obj_terms = []
    makespan = model.NewIntVar(0, horizon, "makespan")

    for ti, t in enumerate(tasks):
        cands = all_cands[ti]
        bt = [model.NewBoolVar(f"b_{ti}_{j}") for j in range(len(cands))]
        model.AddExactlyOne(bt)
        b.append(bt)

        slots_used = sorted({s for _, occ in cands for s in occ})
        xt = {s: model.NewBoolVar(f"x_{ti}_{s}") for s in slots_used}
        for s in slots_used:
            covering = [bt[j] for j, (_, occ) in enumerate(cands) if s in set(occ)]
            model.Add(xt[s] == sum(covering))
        x.append(xt)

        # end / makespan
        end_expr = sum(bt[j] * (occ[-1] + 1) for j, (_, occ) in enumerate(cands))
        model.Add(makespan >= end_expr)

        # preference + priority costs folded into candidate choice
        prio_w = n - ti
        for j, (k, occ) in enumerate(cands):
            pref = sum(1 for s in occ if slot_state(t, start, s) == "preferred")
            cost = -w_pref * pref + prio_w * k
            if cost:
                obj_terms.append(cost * bt[j])

    # unit assignment
    a = []  # a[t] : dict unit_name -> BoolVar
    for ti, t in enumerate(tasks):
        at = {}
        for rtype, qty in t.resources.items():
            if qty <= 0:
                continue
            units = pool[rtype]
            uvars = [model.NewBoolVar(f"a_{ti}_{u}") for u in units]
            for u, v in zip(units, uvars, strict=True):
                at[u] = v
            model.Add(sum(uvars) == qty)
        a.append(at)

    # a unit can never serve a task during its own unavailability windows
    for ti, _t in enumerate(tasks):
        for u, av in a[ti].items():
            bad = unavail.get(u)
            if not bad:
                continue
            for s, xv in x[ti].items():
                if s in bad:
                    model.Add(av + xv <= 1)

    # no unit used twice in the same slot
    unit_slot_users: dict[tuple[str, int], list] = {}
    for ti, _t in enumerate(tasks):
        for u, av in a[ti].items():
            for s, xv in x[ti].items():
                y = model.NewBoolVar(f"y_{ti}_{u}_{s}")
                model.Add(y >= av + xv - 1)
                unit_slot_users.setdefault((u, s), []).append(y)
    for (_u, _s), ys in unit_slot_users.items():
        if len(ys) > 1:
            model.Add(sum(ys) <= 1)

    model.Minimize(w_makespan * makespan + sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_search_workers = 8
    t0 = time.time()
    status = solver.Solve(model)
    wall = time.time() - t0

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return Schedule(
            status="INFEASIBLE",
            message=(
                "No schedule satisfies all constraints together. Try relaxing deadlines, "
                "unavailable hours, equipment maintenance windows or resource demands."
            ),
            horizon_start=start.date().isoformat(),
        )

    out: list[ScheduledTask] = []
    for ti, t in enumerate(tasks):
        j = next(j for j, v in enumerate(b[ti]) if solver.Value(v))
        _, occ = all_cands[ti][j]
        units = sorted(u for u, v in a[ti].items() if solver.Value(v))
        segments = []
        seg_start = occ[0]
        prev = occ[0]
        for s in occ[1:] + [None]:
            if s is None or s != prev + 1:
                s_dt = start + timedelta(minutes=seg_start * SLOT_MINUTES)
                e_dt = start + timedelta(minutes=(prev + 1) * SLOT_MINUTES)
                segments.append(
                    ScheduleSegment(
                        start=s_dt.isoformat(timespec="minutes"),
                        end=e_dt.isoformat(timespec="minutes"),
                        start_slot=seg_start,
                        end_slot=prev + 1,
                    )
                )
                if s is not None:
                    seg_start = s
            if s is not None:
                prev = s
        out.append(
            ScheduledTask(task_id=t.id, task_name=t.name, units=units, segments=segments)
        )

    return Schedule(
        status="OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
        message="",
        solved_at=now.isoformat(timespec="seconds"),
        horizon_start=start.date().isoformat(),
        makespan_minutes=(solver.Value(makespan) - now_slot) * SLOT_MINUTES if out else 0,
        solve_time_s=round(wall, 3),
        tasks=out,
    )
