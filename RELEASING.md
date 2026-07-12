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
     the release notes and the built sdist/wheel attached.

No PyPI publishing yet — install from a release's attached wheel or straight
from the tag (`pip install git+https://github.com/Mavrikant/OptimalTaskPlanner.git@vX.Y.Z`)
until that's set up.

## Versioning

[Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`. Given the
project's still pre-1.0 (`0.x`), breaking changes can land in a `MINOR` bump —
bump `MAJOR` once the project reaches a stable 1.0 API/data-format contract.

`optimal_task_planner.__version__` is read from the installed package's metadata
(`importlib.metadata`), not hardcoded — `pyproject.toml`'s `version` is the
only place to change.
