# Contributing to LabPlanner

Thanks for your interest in contributing! This document describes how to set up a
development environment and the conventions we follow.

Using an AI coding agent (Claude Code, Codex, Cursor, ...)? See
[AGENTS.md](AGENTS.md) instead — it's the denser, agent-oriented version of this
file: repo map, exact commands, and the same conventions below in agent-consumable
form.

## Development setup

```bash
git clone https://github.com/Mavrikant/LabPlanner.git
cd LabPlanner
python -m venv .venv
# Windows: .venv\Scripts\activate    Linux/macOS: source .venv/bin/activate
pip install -e .[dev]
pre-commit install   # optional: runs ruff check --fix + ruff format + mypy on every commit
```

Run the app locally:

```bash
labplanner --reload
```

## Quality checks

Before opening a pull request, make sure all four pass:

```bash
ruff check .
ruff format --check .
mypy
pytest
```

CI runs the same checks on Python 3.12, 3.13 and 3.14 on Ubuntu, plus Python 3.13
on macOS and Windows.

If you touched `static/app.js` (or anything UI-facing), also run the end-to-end test —
it's the only automated frontend coverage:

```bash
npm install && npx playwright install --with-deps chromium   # once
labplanner --port 8010 --data-dir /tmp/lp-e2e-data &
LABPLANNER_BASE_URL=http://127.0.0.1:8010 npx playwright test
```

## Guidelines

- Keep the backend in English (code, comments, error messages).
- Every user-visible frontend string must go through the i18n layer: add the
  key to **every** dictionary in `src/labplanner/static/locales/*.json`
  (a test enforces that all locales share the same keys).
- Adding a language is two steps: create `static/locales/<code>.json` with the
  same keys as `en.json`, and append a `{code, name, flag}` entry to
  `LANGUAGES` in `static/i18n.js`.
- The solver (`solver.py`) must stay deterministic under an injected `now`
  timestamp — that is what makes it testable. Add a test for any solver change.
- If a test passes an explicit `time_limit_s` to the solver, give it generous
  headroom (it's a ceiling, not a performance target) — CI runners, especially
  `windows-latest`, are slower/shared and a tight budget causes flaky timeouts.
- Changing the shape of project JSON (fields on `Project`, `Task`, etc. in
  `models.py`) requires bumping `SCHEMA_VERSION` and adding a matching forward
  migration step in `storage.py`, so existing project files keep loading.
- Prefer small, focused pull requests with a clear description.

## Releasing

Maintainer only — see [RELEASING.md](RELEASING.md) for the tag-triggered release
process.

## Reporting bugs

Open a GitHub issue with:

- what you did, what you expected, and what happened,
- your `data/project.json` if the problem is solver-related (redact names if needed),
- Python version and OS.
