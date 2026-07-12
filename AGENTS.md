# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this
repository. Humans: see [README.md](README.md) for product docs and
[CONTRIBUTING.md](CONTRIBUTING.md) for the contribution process — this file is the
denser, agent-oriented map of the codebase.

## What this project is

Optimal Task Planner is a local-only web app: a FastAPI backend that runs a CP-SAT (OR-Tools)
scheduler over a rolling horizon of 30-minute slots, plus a dependency-free vanilla-JS
frontend. No database — each project is a single JSON file on disk. See the README's
"How it works" section for the scheduling model itself.

## Setup & commands

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e .[dev]

ruff check .            # lint
ruff format --check .   # formatting (use `ruff format .` to fix)
mypy                    # type check (src/optimal_task_planner only, see [tool.mypy] in pyproject.toml)
pytest                  # full test suite
pytest tests/test_solver.py -k reschedule   # run a subset while iterating

optimal-task-planner --reload     # run the dev server at http://127.0.0.1:8000

npm install                                          # once, installs Playwright
npx playwright install --with-deps chromium           # once, downloads the browser
optimal-task-planner --port 8010 --data-dir /tmp/optimal-task-planner-e2e-data --no-browser &  # server for e2e (separate data dir)
OPTIMAL_TASK_PLANNER_BASE_URL=http://127.0.0.1:8010 npx playwright test   # e2e/smoke.spec.js
```

Run `ruff check .`, `ruff format --check .`, `mypy` and `pytest` before considering any
backend change done — CI (`.github/workflows/ci.yml`) runs the same four on Python
3.12/3.13/3.14 (Ubuntu) and 3.13 (macOS, Windows), plus a package-build check and the
Playwright e2e job. Touching any `static/*.js` file? Also run the e2e test above —
it's the only automated coverage the frontend has.

`ortools.sat.python.cp_model.CpModel`'s legacy PascalCase methods (`NewIntVar`,
`AddExactlyOne`, ...) lack type stubs — use the modern snake_case API
(`new_int_var`, `add_exactly_one`, ...) instead, which is fully typed and behaves
identically. Also: within one function, avoid reusing a loop variable name (e.g. `s`)
across unrelated loops if their element types differ (one `int`, another
`int | None`) — mypy infers a single type per unannotated local per function, so the
second usage gets a spurious type error. Give it a distinct name instead.

## Repo map

```
src/optimal_task_planner/
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
                      automatic backup snapshots, forward-only schema migrations,
                      published share pages (data_dir/shares/).
  api.py              FastAPI routes — projects CRUD, background solve jobs,
                      share-link publishing, holidays, health. Thin: validation
                      lives in models.py, logic lives in solver.py/storage.py.
  config.py           Settings.from_env() — server-level config (host/port/
                      data-dir/days/solver-time-limit) from CLI flags or
                      OPTIMAL_TASK_PLANNER_* env vars.
  cli.py              `optimal-task-planner` entry point (argparse + uvicorn.run).
  __init__.py          `__version__` is read from installed package metadata
                      (`importlib.metadata`), not hardcoded — see RELEASING.md.
  static/             Vanilla JS, no framework, no build step, no ES modules —
                      every file below is a classic <script> tag (see index.html)
                      executing in this exact order, all sharing one global scope.
                      A function/const defined in an earlier file is visible to
                      later ones (and vice versa inside deferred callbacks, since
                      by the time any handler actually runs, every script has
                      already loaded) — but preserve this load order if you
                      reorder or add files, and add new globals to the file
                      whose domain they belong to, not wherever is convenient.
    i18n.js            LANGUAGES list + locale loading/switching.
    icons.js            Inline SVG icon set.
    core.js             State, $/$$ /esc/api() helpers, save, undo/redo, toasts
                        & modal — foundational, everything else depends on it.
    shell.js            Onboarding tour, theme/tab/language chrome, project
                        switcher (new/rename/duplicate/import/export/backups).
    resources.js        Resources tab: resource pool (equipment or people), unit availability, the
                        shared paintable slot grid (also used by tasks.js —
                        must stay loaded before it), working calendar/holidays.
    tasks.js            Tasks tab: task list (drag/keyboard reorder) + editor.
    schedule.js          Async solve (job/progress/cancel) + Schedule tab:
                         Gantt SVG, details table, HTML export.
    insights.js          Insights tab: KPI tiles, utilisation bars, load heatmap.
                        Also hosts the schedule report builder shared by
                        "Export HTML" and share-link publishing.
    boot.js              App bootstrap — always loads last.
    locales/*.json      One file per language; en.json is the source of truth for keys.
    fonts/               Self-hosted InterVariable.woff2 (OFL-licensed, LICENSE.txt
                        alongside it) — no CDN/Google Fonts, this is a local-only app.
    index.html, style.css

tests/
  conftest.py          `settings`/`client` fixtures (TestClient over a tmp_path data dir).
  test_solver.py        Solver behavior — the largest suite; add a test for any
                         solver.py change.
  test_models.py, test_storage.py, test_calendar.py, test_api.py, test_locales.py

e2e/
  smoke.spec.js         Playwright: loads the app, solves the seeded sample
                         project, asserts the Gantt renders. The only
                         automated frontend coverage — extend this rather than
                         adding a parallel test runner.

scripts/
  prepare_release.py   Bumps pyproject.toml's version and rolls CHANGELOG's
                        Unreleased section into a dated one. See RELEASING.md.
  extract_changelog.py  Prints one version's CHANGELOG section; used by the
                         release workflow to build GitHub Release notes.

packaging/
  pyinstaller_entry.py  Entry script for the frozen Windows executable.
  optimal-task-planner.spec  PyInstaller spec (run from the repo root).

Dockerfile, .dockerignore, docker-compose.yml
                       The GHCR image (python:3.13-slim, non-root, /data
                        volume) and a LAN-server compose example.

.github/workflows/
  ci.yml               Lint, format check, test matrix, Playwright e2e,
                        package-build check, Docker build smoke — every push/PR.
  release.yml           Tag-triggered (`vX.Y.Z`): re-verifies, builds, then
                         publishes a GitHub Release, PyPI (Trusted Publishing),
                         the GHCR Docker image and a Windows exe. See RELEASING.md.
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
- **Logging**: each backend module gets its own `logger = logging.getLogger(__name__)`;
  `cli.py` calls `logging.basicConfig()` so it's actually visible when running
  `optimal-task-planner` (library code should never call `basicConfig` itself). Log
  lifecycle events at `INFO` (solve start/end + status, migrations, backup
  snapshots, solve-job submission) and unexpected exceptions with
  `logger.exception(...)` inside an `except` block so the traceback isn't lost —
  don't add per-request access logging, uvicorn already does that.
- **Style**: `ruff` (line length 100, rules in `[tool.ruff.lint]` of
  `pyproject.toml`) is the only enforced style; no separate formatter config beyond
  `ruff format`. Module docstrings explain *why*/*invariants*, not what the code
  obviously does — match that tone rather than adding narrative comments.
- **Design tokens** (`style.css` `:root`/`[data-theme="dark"]`): `--accent` is a
  deliberately-chosen teal, not the ubiquitous Tailwind-blue-600 SaaS default —
  don't casually change it back. The Gantt's `PALETTE` (`schedule.js`) is 16 hues
  rotated evenly from that same accent at matched saturation/lightness (not a
  hand-picked or off-the-shelf categorical scheme); if it ever needs more colors
  or retuning, regenerate the whole set the same way (`colorsys.hls_to_rgb` at
  fixed S/L, hue offsets of `360/n`) rather than hand-picking one new color that
  won't match the family.
- Prefer small, focused changes; this is a young single-package project without
  internal abstraction layers to preserve — don't add framework/plugin machinery
  the codebase doesn't already have a need for.

## Testing notes

- Tests use `tmp_path` for isolated data directories (see `conftest.py`) — never touch
  the real `data/` directory (which is git-ignored and holds live user projects) from a test.
- `tests/test_api.py` exercises the HTTP layer via `TestClient`; solver-level behavior
  belongs in `test_solver.py` instead, calling the solver directly for speed and precision.
- When a solver test passes an explicit `time_limit_s`, give it generous headroom
  (seconds, not a tight bound) — it's a ceiling CP-SAT rarely needs in full, not a
  performance target, and a tight one is flaky on slower/shared CI runners (observed
  on `windows-latest`: search times out before finding any solution, which the solver
  reports as `status="INFEASIBLE"` rather than a distinct timeout status).

## PR / commit expectations

- Keep backend changes and their tests in the same change.
- Update `CHANGELOG.md` under the `## [Unreleased]` section for user-facing changes
  (see existing entries for tone/format). Don't add a new dated version heading
  yourself — `scripts/prepare_release.py` does that at release time.
- Don't hand-edit `src/optimal_task_planner.egg-info/`, `__pycache__/`, `.pytest_cache/`, or
  `.ruff_cache/` — all are generated/git-ignored.
- Never hardcode a version string — `optimal_task_planner.__version__` is derived from
  installed package metadata (see `__init__.py`). Cutting a release is a
  maintainer action documented in [RELEASING.md](RELEASING.md), not something
  an agent should do unprompted.
