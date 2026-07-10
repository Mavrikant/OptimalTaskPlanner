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
```

Run the app locally:

```bash
labplanner --reload
```

## Quality checks

Before opening a pull request, make sure all three pass:

```bash
ruff check .
ruff format --check .
pytest
```

CI runs the same checks on Python 3.12, 3.13 and 3.14 on Ubuntu, plus Python 3.13
on macOS and Windows.

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
- Changing the shape of project JSON (fields on `Project`, `Task`, etc. in
  `models.py`) requires bumping `SCHEMA_VERSION` and adding a matching forward
  migration step in `storage.py`, so existing project files keep loading.
- Prefer small, focused pull requests with a clear description.

## Reporting bugs

Open a GitHub issue with:

- what you did, what you expected, and what happened,
- your `data/project.json` if the problem is solver-related (redact names if needed),
- Python version and OS.
