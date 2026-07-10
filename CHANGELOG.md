# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-10

### Added

- Initial open-source release.
- CP-SAT based optimal scheduling over a rolling horizon with 30-minute slot resolution.
- Task model: duration, work-hours-only, continue-next-day, deadlines, earliest starts,
  pinned starts, dependencies, statuses (pending/in-progress/done),
  preferred/unavailable time slots, drag-to-reorder priorities.
- Re-planning: done tasks are excluded, in-progress tasks stay frozen on their
  current units and times; infeasible models come back with a relaxation hint.
- Equipment pool with per-unit availability calendars (maintenance/booking windows)
  and optional custom unit names.
- Configurable working calendar: work start/end times (30-minute steps) and
  public holidays with manual selection or country-based auto-fill.
- Bilingual web UI (English/Turkish) with modals, toasts and a paintable slot grid.
- Full-screen schedule view: zoomable SVG Gantt with rich hover tooltips, a
  start/end details table, and a self-contained interactive HTML report export
  that shares the Gantt's zoom.
- Dark mode, first-visit onboarding tour, per-section help screens,
  JSON-based locales, keyboard and touch accessibility.
- Multiple projects (create, rename, duplicate, import/export, delete) with a
  header switcher; snapshot-based undo/redo (Ctrl+Z/Y).
- Solving runs as a cancellable background job with live progress (elapsed time
  and best makespan so far); the unit-conflict model is pruned so large projects
  stay solvable. Per-project solver settings (time limit, workers, horizon days)
  and ranked infeasibility hints.
- Automatic backup snapshots with in-app restore; schema-versioned data files
  with a forward-migration chain (the legacy single project.json migrates
  losslessly on first start).
- REST API (`/api/project`, `/api/solve`, `/api/holidays`, `/api/health`).
- `labplanner` CLI entry point with `--host/--port/--data-dir/--days/--reload`.
