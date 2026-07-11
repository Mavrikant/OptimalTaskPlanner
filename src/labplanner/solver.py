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

import contextlib
import logging
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
    equipment_units,
)

logger = logging.getLogger(__name__)


def slot_state(task: Task, start: datetime, s: int) -> str:
    day = (start + timedelta(days=s // SLOTS_PER_DAY)).date().isoformat()
    return task.slots.get(day, {}).get(str(s % SLOTS_PER_DAY), "")


def _time_point_slot(tp, start: datetime) -> int | None:
    try:
        d = date.fromisoformat(tp.date)
    except ValueError:
        return None
    return (d - start.date()).days * SLOTS_PER_DAY + tp.slot_of_day


def deadline_slot(task: Task, start: datetime) -> int | None:
    return _time_point_slot(task.deadline, start) if task.deadline else None


def earliest_start_slot(task: Task, start: datetime) -> int | None:
    return _time_point_slot(task.earliest_start, start) if task.earliest_start else None


def pinned_start_slot(task: Task, start: datetime) -> int | None:
    return _time_point_slot(task.pinned_start, start) if task.pinned_start else None


def _hours(slots: int) -> str:
    return f"{slots * SLOT_MINUTES / 60:g}"


def candidate_starts(
    task: Task, start: datetime, work: list[bool], now_slot: int, horizon: int
) -> tuple[list[tuple[int, list[int]]], str]:
    """Return ``([(start_slot, occupied_slots)], reason_if_empty)``."""
    dur = task.duration_slots
    blocked = {s for s in range(horizon) if slot_state(task, start, s) == "unavailable"}
    dl = deadline_slot(task, start)
    if dl is not None and task.deadline is not None and dl <= now_slot:
        return [], (f"deadline {task.deadline.date} {task.deadline.time} is already in the past")
    es = earliest_start_slot(task, start)
    if es is not None:
        if es >= horizon and task.earliest_start is not None:
            return [], (
                f"earliest start {task.earliest_start.date} {task.earliest_start.time} "
                f"is beyond the {horizon // SLOTS_PER_DAY}-day horizon"
            )
        if dl is not None and es + dur > dl:
            return [], "earliest start leaves no room before the deadline"
    pin = pinned_start_slot(task, start)
    if pin is not None:
        if pin < now_slot and task.pinned_start is not None:
            return [], (
                f"pinned start {task.pinned_start.date} {task.pinned_start.time} "
                "is already in the past"
            )
        if pin >= horizon and task.pinned_start is not None:
            return [], (
                f"pinned start {task.pinned_start.date} {task.pinned_start.time} "
                f"is beyond the {horizon // SLOTS_PER_DAY}-day horizon"
            )
    min_start = now_slot if es is None else max(now_slot, es)

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
                if occ[0] < min_start:
                    continue
                if blocked.intersection(occ):
                    continue
                if dl is not None and occ[-1] + 1 > dl:
                    continue
                cands.append((occ[0], occ))
        else:
            n_days = horizon // SLOTS_PER_DAY
            day_len = max(
                (
                    sum(work[d * SLOTS_PER_DAY + s] for s in range(SLOTS_PER_DAY))
                    for d in range(n_days)
                ),
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
                    if k < min_start or blocked.intersection(occ):
                        continue
                    if dl is not None and occ[-1] + 1 > dl:
                        continue
                    cands.append((k, occ))
    else:
        for k in range(max(min_start, 0), horizon - dur + 1):
            occ = list(range(k, k + dur))
            if blocked.intersection(occ):
                continue
            if dl is not None and occ[-1] + 1 > dl:
                continue
            cands.append((k, occ))

    if pin is not None:
        cands = [c for c in cands if c[0] == pin]
        if not cands and task.pinned_start is not None:
            return [], (
                f"pinned start {task.pinned_start.date} {task.pinned_start.time} is not a "
                "feasible start (check working hours, painted slots and the deadline)"
            )
    if not cands:
        return [], (
            "no feasible start slot "
            "(check deadline, earliest start, unavailable hours and duration)"
        )
    return cands, ""


def expand_units(project: Project) -> dict[str, list[str]]:
    """type name -> [unit names]  (custom names, or VSG x3 -> VSG-1..VSG-3)."""
    return {eq.name: equipment_units(eq) for eq in project.equipment}


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


def _dependency_cycle(tasks: list[Task]) -> list[str] | None:
    """Return ids forming a dependency cycle (closed path), or None."""
    ids = {t.id for t in tasks}
    graph = {t.id: [d for d in t.depends_on if d in ids] for t in tasks}
    state: dict[str, int] = {}  # 0/absent=unvisited, 1=in stack, 2=done
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        state[node] = 1
        stack.append(node)
        for nxt in graph[node]:
            if state.get(nxt) == 1:
                return stack[stack.index(nxt) :] + [nxt]
            if state.get(nxt, 0) == 0:
                cycle = visit(nxt)
                if cycle:
                    return cycle
        stack.pop()
        state[node] = 2
        return None

    for node in graph:
        if state.get(node, 0) == 0:
            cycle = visit(node)
            if cycle:
                return cycle
    return None


def _frozen_occupancy(
    prev: ScheduledTask, start: datetime, horizon: int
) -> tuple[list[int] | None, list[str]]:
    """Slots an in-progress task occupies (from its last schedule), clipped to the horizon."""
    occ: set[int] = set()
    for seg in prev.segments:
        try:
            s_dt = datetime.fromisoformat(seg.start)
            e_dt = datetime.fromisoformat(seg.end)
        except ValueError:
            return None, []
        s_slot = int((s_dt - start).total_seconds()) // (SLOT_MINUTES * 60)
        e_slot = int((e_dt - start).total_seconds()) // (SLOT_MINUTES * 60)
        occ.update(s for s in range(s_slot, e_slot) if 0 <= s < horizon)
    return sorted(occ), list(prev.units)


def precheck(project: Project) -> list[str]:
    errors = []
    counts = {eq.name: eq.count for eq in project.equipment}
    names = {t.id: t.name for t in project.tasks}
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
    cycle = _dependency_cycle(project.tasks)
    if cycle:
        errors.append("Dependency cycle: " + " → ".join(names.get(i, i) for i in cycle))
    return errors


def solve(
    project: Project,
    days: int = 14,
    now: datetime | None = None,
    time_limit_s: float = 20.0,
    explain: bool = True,
    workers: int = 8,
    progress=None,  # optional callable(best_makespan_minutes) on each new solution
    cancel=None,  # optional threading.Event; StopSearch() when set
) -> Schedule:
    now = now or datetime.now()
    start = horizon_start(now)
    now_slot = first_free_slot(now)
    horizon = days * SLOTS_PER_DAY
    work = build_work_mask(start, days, project.calendar)

    logger.info(
        "solve starting: %d task(s), %d-day horizon, time_limit=%.1fs, workers=%d",
        len(project.tasks),
        days,
        time_limit_s,
        workers,
    )

    errors = precheck(project)
    if errors:
        logger.info("solve rejected at precheck: %s", "; ".join(errors))
        return Schedule(
            status="INFEASIBLE",
            message="; ".join(errors),
            horizon_start=start.date().isoformat(),
        )

    # status handling: done tasks are skipped; in-progress tasks are frozen to the
    # place (slots + units) they got in the previous schedule
    prev_by_id = {st.task_id: st for st in (project.schedule.tasks if project.schedule else [])}
    tasks: list[Task] = []
    frozen: dict[int, tuple[list[int], list[str]]] = {}  # index -> (occupied slots, units)
    for t in project.tasks:
        if t.status == "done":
            continue
        if t.status == "in_progress" and t.id in prev_by_id:
            occ, units = _frozen_occupancy(prev_by_id[t.id], start, horizon)
            if occ is not None:
                if not occ:
                    continue  # already finished entirely in the past
                frozen[len(tasks)] = (occ, units)
        tasks.append(t)

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
    for ti, t in enumerate(tasks):
        if ti in frozen:
            occ, _ = frozen[ti]
            all_cands.append([(occ[0], occ)])  # single, immovable candidate
            continue
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
    w_prio_max = n * n * horizon + 1  # dominate priority term
    w_pref = w_prio_max  # per preferred slot
    total_dur = sum(t.duration_slots for t in tasks)
    w_makespan = w_pref * (total_dur + 1)  # dominate preference term

    b = []  # b[t][j] candidate selected
    x = []  # x[t] : dict slot -> BoolVar occupancy
    start_exprs = []
    end_exprs = []
    obj_terms = []
    makespan = model.new_int_var(0, horizon, "makespan")

    for ti, t in enumerate(tasks):
        cands = all_cands[ti]
        bt = [model.new_bool_var(f"b_{ti}_{j}") for j in range(len(cands))]
        model.add_exactly_one(bt)
        b.append(bt)

        slots_used = sorted({s for _, occ in cands for s in occ})
        xt = {s: model.new_bool_var(f"x_{ti}_{s}") for s in slots_used}
        for s in slots_used:
            covering = [bt[j] for j, (_, occ) in enumerate(cands) if s in set(occ)]
            model.add(xt[s] == sum(covering))
        x.append(xt)

        # start / end / makespan
        start_exprs.append(sum(bt[j] * k for j, (k, _) in enumerate(cands)))
        end_expr = sum(bt[j] * (occ[-1] + 1) for j, (_, occ) in enumerate(cands))
        end_exprs.append(end_expr)
        model.add(makespan >= end_expr)

        # preference + priority costs folded into candidate choice
        prio_w = n - ti
        for j, (k, occ) in enumerate(cands):
            pref = sum(1 for s in occ if slot_state(t, start, s) == "preferred")
            cost = -w_pref * pref + prio_w * k
            if cost:
                obj_terms.append(cost * bt[j])

    # dependencies: a task may only start after every prerequisite has ended
    id_to_idx = {t.id: i for i, t in enumerate(tasks)}
    for ti, t in enumerate(tasks):
        for dep_id in t.depends_on:
            di = id_to_idx.get(dep_id)
            if di is None:
                continue  # missing / done / already-finished prerequisite
            model.add(start_exprs[ti] >= end_exprs[di])

    # unit assignment
    a = []  # a[t] : dict unit_name -> BoolVar
    for ti, t in enumerate(tasks):
        at = {}
        for rtype, qty in t.resources.items():
            if qty <= 0:
                continue
            units = pool[rtype]
            uvars = [model.new_bool_var(f"a_{ti}_{u}") for u in units]
            for u, v in zip(units, uvars, strict=True):
                at[u] = v
            model.add(sum(uvars) == qty)
        if ti in frozen:  # keep an in-progress task on the units it already uses
            _, prev_units = frozen[ti]
            for rtype, qty in t.resources.items():
                if qty <= 0:
                    continue
                kept = [u for u in prev_units if u in pool.get(rtype, [])]
                if len(kept) == qty:
                    for u in kept:
                        model.add(at[u] == 1)
        a.append(at)

    # a unit can never serve a task during its own unavailability windows
    for ti, _t in enumerate(tasks):
        for u, av in a[ti].items():
            bad = unavail.get(u)
            if not bad:
                continue
            for s, xv in x[ti].items():
                if s in bad:
                    model.add(av + xv <= 1)

    # no unit used twice in the same slot. Only reify (unit, slot) where two or
    # more tasks could actually contend — a lone candidate can't conflict with
    # itself, so skipping singletons keeps the model identical in meaning while
    # cutting the bulk of the boolean variables on large projects.
    contenders: dict[tuple[str, int], list[int]] = {}
    for ti, _t in enumerate(tasks):
        for u in a[ti]:
            for s in x[ti]:
                contenders.setdefault((u, s), []).append(ti)
    for (u, s), tis in contenders.items():
        if len(tis) < 2:
            continue
        ys = []
        for ti in tis:
            y = model.new_bool_var(f"y_{ti}_{u}_{s}")
            model.add(y >= a[ti][u] + x[ti][s] - 1)
            ys.append(y)
        model.add_at_most_one(ys)

    model.minimize(w_makespan * makespan + sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_search_workers = max(1, workers)

    callback = None
    if progress is not None or cancel is not None:

        class _Callback(cp_model.CpSolverSolutionCallback):
            def on_solution_callback(self):
                if progress is not None:
                    # progress reporting must never break the solve
                    with contextlib.suppress(Exception):
                        progress((self.Value(makespan) - now_slot) * SLOT_MINUTES)
                if cancel is not None and cancel.is_set():
                    self.StopSearch()

        callback = _Callback()

    t0 = time.time()
    status = solver.Solve(model, callback) if callback else solver.Solve(model)
    wall = time.time() - t0

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        if cancel is not None and cancel.is_set():
            logger.info("solve cancelled after %.1fs", wall)
            return Schedule(
                status="CANCELLED",
                message="Solve cancelled before a schedule was found.",
                horizon_start=start.date().isoformat(),
            )
        logger.info(
            "solve found no schedule after %.1fs (cp_model status=%s, time_limit=%.1fs)",
            wall,
            solver.status_name(status),
            time_limit_s,
        )
        message = (
            "No schedule satisfies all constraints together. Try relaxing deadlines, "
            "unavailable hours, equipment maintenance windows or resource demands."
        )
        hints = explain_infeasible(project, days=days, now=now) if explain else []
        return Schedule(
            status="INFEASIBLE",
            message=message,
            hints=hints,
            horizon_start=start.date().isoformat(),
        )

    out: list[ScheduledTask] = []
    for ti, t in enumerate(tasks):
        j = next(j for j, v in enumerate(b[ti]) if solver.Value(v))
        _, occ_slots = all_cands[ti][j]
        units = sorted(u for u, v in a[ti].items() if solver.Value(v))
        segments = []
        seg_start = occ_slots[0]
        prev = occ_slots[0]
        for nxt in occ_slots[1:] + [None]:
            if nxt is None or nxt != prev + 1:
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
                if nxt is not None:
                    seg_start = nxt
            if nxt is not None:
                prev = nxt
        out.append(ScheduledTask(task_id=t.id, task_name=t.name, units=units, segments=segments))

    result_status = "OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE"
    makespan_minutes = (solver.Value(makespan) - now_slot) * SLOT_MINUTES if out else 0
    logger.info(
        "solve found %s schedule in %.1fs: %d task(s), makespan=%dmin",
        result_status,
        wall,
        len(out),
        makespan_minutes,
    )
    return Schedule(
        status=result_status,
        message="",
        solved_at=now.isoformat(timespec="seconds"),
        horizon_start=start.date().isoformat(),
        makespan_minutes=makespan_minutes,
        solve_time_s=round(wall, 3),
        tasks=out,
    )


def _clear_start_constraints(t: Task) -> None:
    t.earliest_start = None
    t.pinned_start = None


# Constraint families the infeasibility explainer tries to relax, in order:
# (description with task name, description for the whole family, applies?, relax)
_RELAX_FAMILIES = [
    (
        "the deadline of task '{name}'",
        "all deadlines",
        lambda t: t.deadline is not None,
        lambda t: setattr(t, "deadline", None),
    ),
    (
        "the dependencies of task '{name}'",
        "all task dependencies",
        lambda t: bool(t.depends_on),
        lambda t: setattr(t, "depends_on", []),
    ),
    (
        "the earliest/pinned start of task '{name}'",
        "all earliest and pinned starts",
        lambda t: t.earliest_start is not None or t.pinned_start is not None,
        _clear_start_constraints,
    ),
    (
        "the unavailable slots painted on task '{name}'",
        "all painted task slots",
        lambda t: bool(t.slots),
        lambda t: setattr(t, "slots", {}),
    ),
    (
        "the work-hours-only restriction of task '{name}'",
        "all work-hours-only restrictions",
        lambda t: t.work_hours_only,
        lambda t: setattr(t, "work_hours_only", False),
    ),
]


def explain_infeasible(
    project: Project,
    days: int,
    now: datetime,
    per_try_limit_s: float = 3.0,
    budget_s: float = 15.0,
    max_hints: int = 3,
) -> list[str]:
    """Suggest constraints whose relaxation would make the project feasible.

    Runs bounded relaxed re-solves family by family (narrowing to a single task
    where possible) and returns up to ``max_hints`` distinct English suggestions,
    ranked by the family order. Returns [] when nothing conclusive fits the budget.
    """
    t0 = time.time()
    hints: list[str] = []

    def feasible(candidate: Project) -> bool:
        if time.time() - t0 > budget_s:
            raise TimeoutError
        result = solve(candidate, days=days, now=now, time_limit_s=per_try_limit_s, explain=False)
        return result.status in ("OPTIMAL", "FEASIBLE")

    try:
        for task_msg, family_msg, applies, relax in _RELAX_FAMILIES:
            if len(hints) >= max_hints:
                break
            relaxed = project.model_copy(deep=True)
            affected = [t for t in relaxed.tasks if applies(t)]
            if not affected:
                continue
            for t in affected:
                relax(t)
            if not feasible(relaxed):
                continue
            hint = None
            for cand in affected[:8]:  # narrow to a single task if we can
                single = project.model_copy(deep=True)
                target = next(t for t in single.tasks if t.id == cand.id)
                relax(target)
                if feasible(single):
                    hint = (
                        f"Relaxing {task_msg.format(name=target.name)} makes the schedule feasible."
                    )
                    break
            hints.append(hint or f"Relaxing {family_msg} makes the schedule feasible.")

        if len(hints) < max_hints and any(eq.unavailable for eq in project.equipment):
            relaxed = project.model_copy(deep=True)
            for eq in relaxed.equipment:
                eq.unavailable = {}
            if feasible(relaxed):
                hints.append("Relaxing the unit maintenance windows makes the schedule feasible.")
    except TimeoutError:
        pass
    return hints
