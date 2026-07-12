"""Optimal Task Planner — optimal lab equipment scheduling over a rolling horizon."""

from importlib.metadata import PackageNotFoundError, version

try:
    # `version` in pyproject.toml is the single source of truth; reading it back
    # here (instead of duplicating the string) means a release bump can't drift
    # out of sync with what actually gets built and published.
    __version__ = version("optimal-task-planner")
except PackageNotFoundError:  # running from source without an editable install
    __version__ = "0.0.0+unknown"
