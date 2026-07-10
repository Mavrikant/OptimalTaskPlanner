#!/usr/bin/env python3
"""Bump the project version and roll CHANGELOG's Unreleased section into it.

Usage:
    python scripts/prepare_release.py X.Y.Z

Then review the diff, commit, tag, and push — see RELEASING.md.
"""

from __future__ import annotations

import datetime
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYPROJECT = ROOT / "pyproject.toml"
CHANGELOG = ROOT / "CHANGELOG.md"
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")


def bump_pyproject(version: str) -> None:
    text = PYPROJECT.read_text(encoding="utf-8")
    new_text, n = re.subn(r'(?m)^version = "[^"]+"$', f'version = "{version}"', text, count=1)
    if n != 1:
        raise SystemExit('could not find a `version = "..."` line in pyproject.toml')
    PYPROJECT.write_text(new_text, encoding="utf-8")


def roll_changelog(version: str) -> None:
    text = CHANGELOG.read_text(encoding="utf-8")
    if f"## [{version}]" in text:
        raise SystemExit(f"CHANGELOG.md already has a section for {version}")
    if "## [Unreleased]" not in text:
        raise SystemExit("CHANGELOG.md has no '## [Unreleased]' section to roll over")
    today = datetime.date.today().isoformat()
    # Inserting the new heading right after "## [Unreleased]" leaves that
    # section empty and moves everything that was under it (the actual
    # unreleased entries) under the new dated version heading, in one edit.
    new_text = text.replace("## [Unreleased]", f"## [Unreleased]\n\n## [{version}] - {today}", 1)
    CHANGELOG.write_text(new_text, encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2 or not VERSION_RE.match(sys.argv[1]):
        raise SystemExit("usage: prepare_release.py X.Y.Z  (no leading 'v')")
    version = sys.argv[1]
    bump_pyproject(version)
    roll_changelog(version)
    print(f"Bumped to {version}. Next steps:")
    print("  1. Review the diff (git diff).")
    print(f"  2. git commit -am 'Release v{version}'")
    print(f"  3. git tag v{version} && git push origin main v{version}")


if __name__ == "__main__":
    main()
