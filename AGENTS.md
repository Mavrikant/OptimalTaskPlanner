# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this
repository. Humans: see [README.md](README.md) for product docs and
[CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process — this file is the
denser, agent-oriented map of the codebase.

## What this project is

LabPlanner is a local-only web app: a FastAPI backend that runs a CP-SAT (OR-Tools)
scheduler over a rolling horizon of 30-minute slots, plus a dependency-free vanilla-JS
frontend. No database — each project is a single JSON file on disk. See the README's
"How it works" section for the scheduling model itself.

## Setup & commands

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .[dev]

ruff check .            # lint
ruff format --check .   # formatting (use `ruff format .` to fix)
pytest                  # full test suite
pytest tests/test_solver.py -k reschedule   # run a subset while iterating

labplanner --reload     # run the dev server at http://127.0.0.1:8000
```

Run `ruff check .`, `ruff format --check .` and `pytest` before considering any change
done — CI (`.github/workflows/ci.yml`) runs the same three on Python 3.12/3.13/3.14
(Ubuntu) and 3.13 (macOS, Windows), plus a package-build check.

## Repo map

```
src/labplanner/
  models.py          Pydantic schema for Project/Task/WorkCalendar/Schedule.
                      Defines the 30-minute slot system (SLOT_MINUTES, SLOTS_PER_DAY)
                      and SCHEMA_VERSION for on-disk project files.
  solver.py           CP-SAT model: enumerates feasible start slots per task, assigns
                      physical units, lexicographic objective (makespan, then
                      preferred-slot usage, then priority). Pure function of
                      (project data, injected `now`) — see "Solver rules" below.
  calendar_utils.py  Slot arithmetic, work-hour masks, public-holiday lookups
                      (wraps the `holidays` package).
  storage.py          File-based persistence: data_dir/projects/<id>.json,
                      automatic backup snapshots, forward-only schema migrations.
  api.py              FastAPI routes — projects CRUD, background solve jobs,
                      holidays, health. Thin: validation lives in models.py,
                      logic lives in solver.py/storage.py.
  config.py           Settings.from_env() — server-level config (host/port/
                      data-dir/days/solver-time-limit) from CLI flags or
                      LABPLANNER_* env vars.
  cli.py              `labplanner` entry point (argparse + uvicorn.run).
  static/
    app.js            Entire frontend — vanilla JS, no framework, no build step.
    i18n.js            LANGUAGES list + locale loading/switching.
    icons.js            Inline SVG icon set.
    locales/*.json     One file per language; en.json is the source of truth for keys.
    index.html, style.css

tests/
  conftest.py          `settings`/`client` fixtures (TestClient over a tmp_path data dir).
  test_solver.py        Solver behavior — the largest suite; add a test for any
                         solver.py change.
  test_models.py, test_storage.py, test_calendar.py, test_api.py, test_locales.py
```

## Conventions

- **Backend code, comments, docstrings and error messages are English-only** —
  even though the UI is bilingual (English/Turkish).
- **i18n**: every user-visible frontend string goes through `t("key")` and must have a
  matching key in **every** file under `static/locales/`. `test_locales.py` enforces
  that all locale files share the same key set — run it after touching UI strings.
  Adding a language: create `static/locales/<code>.json` with the same keys as
  `en.json`, then append `{code, name, flag}` to `LANGUAGES` in `static/i18n.js`.
- **Solver determinism**: `solver.py` must stay a pure function of the project data and
  an explicitly injected `now` — never read the wall clock or other ambient state
  inside it. This is what makes it unit-testable; add/extend a `test_solver.py` case
  for any behavioral change.
- **Schema changes**: if you change the shape of project JSON (fields on `Project`,
  `Task`, etc. in `models.py`), bump `SCHEMA_VERSION` and add a matching forward
  migration step in `storage.py`'s migration chain. Old project files must keep
  loading losslessly.
- **Style**: `ruff` (line length 100, rules in `[tool.ruff.lint]` of
  `pyproject.toml`) is the only enforced style; no separate formatter config beyond
  `ruff format`. Module docstrings explain *why*/*invariants*, not what the code
  obviously does — match that tone rather than adding narrative comments.
- Prefer small, focused changes; this is a young single-package project without
  internal abstraction layers to preserve — don't add framework/plugin machinery
  the codebase doesn't already have a need for.

## Testing notes

- Tests use `tmp_path` for isolated data directories (see `conftest.py`) — never touch
  the real `data/` directory (which is git-ignored and holds live user projects) from a test.
- `tests/test_api.py` exercises the HTTP layer via `TestClient`; solver-level behavior
  belongs in `test_solver.py` instead, calling the solver directly for speed and precision.

## PR / commit expectations

- Keep backend changes and their tests in the same change.
- Update `CHANGELOG.md` under an `[Unreleased]`-style entry for user-facing changes
  (see existing entries for tone/format).
- Don't hand-edit `src/labplanner.egg-info/`, `__pycache__/`, `.pytest_cache/`, or
  `.ruff_cache/` — all are generated/git-ignored.
