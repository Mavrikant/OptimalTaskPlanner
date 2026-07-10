# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-10

### Added

- Initial open-source release.
- CP-SAT based optimal scheduling over a rolling horizon with 30-minute slot resolution.
- Task model: duration, work-hours-only, continue-next-day, deadlines, earliest starts,
  preferred/unavailable time slots, drag-to-reorder priorities.
- Equipment pool with per-unit availability calendars (maintenance/booking windows)
  and optional custom unit names.
- Configurable working calendar: work start/end times (30-minute steps) and
  public holidays with manual selection or country-based auto-fill.
- Bilingual web UI (English/Turkish) with modals, toasts and a paintable slot grid.
- Full-screen schedule view: zoomable SVG Gantt with rich hover tooltips, a
  start/end details table, and self-contained single-file HTML export.
- REST API (`/api/project`, `/api/solve`, `/api/holidays`, `/api/health`).
- `labplanner` CLI entry point with `--host/--port/--data-dir/--days/--reload`.
