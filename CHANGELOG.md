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
- `optimal_task_planner.__version__` is now read from installed package metadata
  instead of being hardcoded, so it can no longer drift from
  `pyproject.toml`.
- Backend logging: solve start/end (status, wall time, makespan), schema
  migrations, backup snapshots and solve-job submission/failure now log at
  `INFO` (visible by default when running `optimal-task-planner`).
- `mypy` type checking, wired into CI and the optional pre-commit hook.
- A Playwright end-to-end smoke test (`e2e/smoke.spec.js`) — the first
  automated frontend coverage — plus a real README screenshot generated
  from it.
- `SECURITY.md`, GitHub issue/PR templates, and a `.pre-commit-config.yaml`
  (ruff + mypy).
- The Schedule tab now shows the solver's best-so-far schedule live while a
  solve is running, instead of just an elapsed-time/makespan text status —
  updates with every improving CP-SAT solution found.
- A search box on the Tasks tab filters the task list by name; priority
  numbers stay tied to each task's real position, not the filtered view.
- A browser notification fires when a solve finishes (done, cancelled or
  failed) while the tab is hidden — solving runs in the background and can
  take a while, so this is the only way to find out without switching back.
  Permission is requested on the first "Solve schedule" click.

### Changed

- Visual refresh: self-hosted Inter (variable font, no CDN) instead of the OS
  default font stack; the accent color moved from stock Tailwind blue to a
  deliberately-chosen teal; the Gantt's 16-color task palette is now
  generated from that same teal (evenly-rotated hues at matched
  saturation/lightness) instead of an off-the-shelf categorical scheme.
  Verified against computed WCAG contrast ratios, not just eyeballed.
- The 404 returned for an unknown/expired solve job now explains that solve
  progress isn't kept across a server restart, instead of just "Unknown
  solve job".
- `static/app.js` (1955 lines, no test coverage until this release added the
  e2e smoke test) is now split into `core.js`, `shell.js`, `resources.js`,
  `tasks.js`, `schedule.js`, `insights.js` and `boot.js`, loaded in that
  order as plain `<script>` tags — still no framework, no build step, no ES
  modules, purely a mechanical split with no behavior change.

### Fixed

- `ProjectStore.list()` renamed to `list_projects()` — as a method literally
  named `list`, it shadowed the builtin `list` type within the class body.
- `solver.py` now uses OR-Tools' modern, fully-typed snake_case CP-SAT API
  (`new_int_var`, `add`, `minimize`, ...) instead of the legacy PascalCase
  aliases, which have no type stubs.
- A corrupt legacy `project.json` crashed the server on every startup
  (uncaught `json.JSONDecodeError`/`ValidationError` in `ensure_default()`).
  It's now moved aside as `project.json.corrupted` and a fresh default
  project is seeded instead, with the failure logged.
- A project file with a `schema_version` newer than the running build
  understands was silently downgraded with no warning; now logs one
  (existing-file compatibility is unchanged — this is observability, not a
  behavior fix).
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
- `optimal-task-planner` CLI entry point with `--host/--port/--data-dir/--days/--reload`.
