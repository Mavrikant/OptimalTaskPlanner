# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Tag-triggered release process: `git tag vX.Y.Z && git push --tags` re-runs
  the test suite, verifies `pyproject.toml` and `CHANGELOG.md` agree with the
  tag, then builds and publishes a GitHub Release with the changelog section
  as notes and the sdist/wheel attached. `scripts/prepare_release.py` bumps
  the version and rolls the changelog in one step. See RELEASING.md.
- `labplanner.__version__` is now read from installed package metadata
  instead of being hardcoded, so it can no longer drift from
  `pyproject.toml`.

### Fixed

- CI: `test_large_project_solves_without_double_booking` was flaky on slower/shared
  runners (notably `windows-latest`) — its 15s CP-SAT time budget was already
  borderline on fast hardware, so the search would occasionally time out before
  finding any solution. Raised to 60s of headroom; the limit is a ceiling the
  solver rarely needs in full, not a performance target.

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
- Insights tab: KPI tiles, per-unit and per-type utilisation bars, a units×days
  load heatmap, and bottleneck / late-task callouts derived from the schedule.
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
