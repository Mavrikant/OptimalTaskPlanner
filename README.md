# LabPlanner

[![CI](https://github.com/OWNER/labplanner/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/labplanner/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](pyproject.toml)

**Optimal lab equipment scheduling over a rolling horizon, powered by
[Google OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver).**

You describe your equipment pool, your tasks and their constraints — LabPlanner computes a
provably optimal schedule and shows it as an interactive Gantt chart. Everything runs locally:
a small FastAPI backend plus a dependency-free vanilla-JS frontend.

<!-- TODO: replace with a real screenshot -->
![Schedule view](docs/screenshot.png)

## Features

- **Optimal, not heuristic** — CP-SAT minimises makespan, then maximises preferred-slot
  usage, then respects task priority (lexicographic objective).
- **30-minute resolution** over a rolling horizon (14 days by default, configurable).
- **Rich task constraints** — duration, work-hours-only, continue-on-next-day splitting,
  hard deadlines, per-slot *preferred*/*unavailable* painting, drag-to-reorder priorities.
- **Equipment pool with per-unit availability** — mark an individual unit (e.g. `VSG-1`)
  as under maintenance and the solver will never assign it during that window.
- **Configurable working calendar** — work start/end times in 30-minute steps, plus public
  holidays: pick dates manually or auto-fill any country's official holidays
  (via the [`holidays`](https://pypi.org/project/holidays/) package).
- **Full-screen schedule view** — SVG Gantt with rich hover tooltips, a start/end details
  table, and one-click export to a self-contained single-file HTML report.
- **Bilingual UI** — English and Turkish, switchable at runtime.
- **Zero database** — your whole project is one human-readable `data/project.json`.

## Quick start

```bash
pip install git+https://github.com/OWNER/labplanner.git
labplanner
```

Then open <http://127.0.0.1:8000>. A sample project is created on first run.

From a source checkout:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    Linux/macOS: source .venv/bin/activate
pip install -e .
labplanner
```

## Usage

1. **Resources tab** — define your equipment types and unit counts, set working hours,
   add public holidays, and paint per-unit maintenance windows.
2. **Tasks tab** — add tasks, set durations and constraints, paint preferred/unavailable
   slots, and drag tasks to set priority (top = most important).
3. Press **Solve schedule** — the schedule opens full-screen with a Gantt chart per
   physical unit, hover tooltips, a details table and an *Export HTML* button.

## Configuration

Server-level settings come from CLI flags or environment variables:

| CLI flag     | Environment variable          | Default     | Description                     |
| ------------ | ----------------------------- | ----------- | ------------------------------- |
| `--host`     | `LABPLANNER_HOST`             | `127.0.0.1` | Bind address                    |
| `--port`     | `LABPLANNER_PORT`             | `8000`      | Port                            |
| `--data-dir` | `LABPLANNER_DATA_DIR`         | `./data`    | Where `project.json` is stored  |
| `--days`     | `LABPLANNER_DAYS`             | `14`        | Planning horizon length in days |
| —            | `LABPLANNER_SOLVER_TIME_LIMIT`| `20`        | CP-SAT time limit (seconds)     |

Working hours and holidays are *project* settings — edit them in the UI; they live in
`project.json` alongside your tasks.

## REST API

The UI talks to a small JSON API you can also use directly
(interactive docs at `/docs`):

| Method & path            | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `GET /api/project`       | Project data + horizon info                    |
| `PUT /api/project`       | Replace project data (validated)               |
| `POST /api/solve`        | Solve and persist the schedule                 |
| `GET /api/holidays/countries` | Countries supported for holiday auto-fill |
| `GET /api/holidays?country=TR&year=2026` | Official holidays for a country/year |
| `GET /api/health`        | Liveness + version                             |

## How it works

For every task the solver enumerates all feasible start slots together with the exact
set of 30-minute slots each start would occupy — this cleanly models work-hours-only
tasks and next-day continuation splits. CP-SAT then picks one start per task and assigns
physical units such that no unit is double-booked and no unit is used during its
unavailability windows. The objective is lexicographic through weighting:

1. minimise **makespan**,
2. maximise **preferred-slot** usage,
3. schedule higher-**priority** tasks earlier.

See [`src/labplanner/solver.py`](src/labplanner/solver.py) — the solver is a pure function
of the project data and an injected `now` timestamp, which keeps it fully unit-testable.

## Development

```bash
pip install -e .[dev]
ruff check .   # lint
pytest         # tests
labplanner --reload
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
