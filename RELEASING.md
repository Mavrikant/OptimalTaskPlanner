# Releasing

Optimal Task Planner uses tag-triggered releases: you decide when and what version to
ship (no auto-computed semantic version from commit messages), and pushing
the tag does the rest — build, verify, and publish a GitHub Release.

## Steps

1. Make sure `main` is green (CI passing) and `CHANGELOG.md` has the
   noteworthy changes listed under `## [Unreleased]`.
2. Bump the version and roll the changelog in one step:

   ```bash
   python scripts/prepare_release.py X.Y.Z
   ```

   This sets `version` in `pyproject.toml` and turns `## [Unreleased]` into
   `## [X.Y.Z] - <today>` (leaving a fresh empty `## [Unreleased]` above it).
   Review the diff — reword/reorder changelog bullets if you want.
3. Commit and tag:

   ```bash
   git commit -am "Release vX.Y.Z"
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```
4. The [release workflow](.github/workflows/release.yml) picks up the tag
   push and:
   - runs lint, format check and the full test suite,
   - verifies `pyproject.toml`'s `version` matches the tag (fails loudly on
     a forgotten bump),
   - verifies `CHANGELOG.md` has a matching `## [X.Y.Z]` section (fails
     loudly on a forgotten changelog entry),
   - builds the sdist and wheel and checks their metadata (`twine check`),
   - creates a GitHub Release for the tag, with that changelog section as
     the release notes and the built sdist/wheel attached,
   - publishes the sdist/wheel to [PyPI](https://pypi.org/p/optimal-task-planner)
     via Trusted Publishing (the `publish-pypi` job),
   - builds and pushes the multi-arch Docker image to
     `ghcr.io/mavrikant/optimal-task-planner` tagged `X.Y.Z`, `X.Y` and
     `latest` (the `publish-docker` job),
   - builds the standalone Windows executable with PyInstaller, smoke-tests
     it, and attaches it to the release as
     `optimal-task-planner-X.Y.Z-windows-x64.exe` (the `windows-exe` job).

## First-time setup (one-time, maintainer-only)

The publish jobs need three things configured once; none involve secrets or
tokens stored in the repo:

1. **PyPI Trusted Publisher** — on [pypi.org](https://pypi.org) (account with
   2FA): Account settings → Publishing → *Add a new pending publisher* with
   project name `optimal-task-planner`, owner `Mavrikant`, repository
   `OptimalTaskPlanner`, workflow `release.yml`, environment `pypi`. The
   first successful publish claims the project name.
2. **GitHub environment** — repo Settings → Environments → create `pypi`.
   Optionally add yourself as a required reviewer to get a manual approval
   gate before each PyPI publish.
3. **GHCR visibility** — after the first release, open your GitHub profile →
   Packages → `optimal-task-planner` → Package settings → change visibility
   to **Public** (workflow-created packages default to private).

## Versioning

[Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`. Given the
project's still pre-1.0 (`0.x`), breaking changes can land in a `MINOR` bump —
bump `MAJOR` once the project reaches a stable 1.0 API/data-format contract.

`optimal_task_planner.__version__` is read from the installed package's metadata
(`importlib.metadata`), not hardcoded — `pyproject.toml`'s `version` is the
only place to change.
