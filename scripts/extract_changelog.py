#!/usr/bin/env python3
"""Print the CHANGELOG.md section for one release version.

Used by the release workflow to turn a `## [X.Y.Z] - YYYY-MM-DD` section into
the GitHub Release body; also handy to preview release notes locally before
tagging: `python scripts/extract_changelog.py 0.2.0`.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

CHANGELOG = Path(__file__).resolve().parent.parent / "CHANGELOG.md"
HEADING = re.compile(r"^## \[(?P<version>[^\]]+)\]")


def section(version: str) -> str:
    lines = CHANGELOG.read_text(encoding="utf-8").splitlines()
    start: int | None = None
    end: int | None = None
    for i, line in enumerate(lines):
        m = HEADING.match(line)
        if not m:
            continue
        if m.group("version") == version:
            start = i + 1
        elif start is not None:
            end = i
            break
    if start is None:
        raise SystemExit(f"No '## [{version}]' section found in CHANGELOG.md")
    body = lines[start : end if end is not None else len(lines)]
    while body and not body[0].strip():
        body.pop(0)
    while body and not body[-1].strip():
        body.pop()
    return "\n".join(body)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: extract_changelog.py VERSION  (e.g. 0.2.0, no leading 'v')")
    print(section(sys.argv[1]))
