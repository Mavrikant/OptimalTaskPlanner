"""Server-level settings, read from environment variables.

Project-level settings that users edit in the UI (working hours, public
holidays) are part of the project data instead — see ``models.WorkCalendar``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import platformdirs


def default_data_dir() -> Path:
    """Default data directory when neither --data-dir nor the env var is set.

    A pre-existing ./data (the pre-0.2 default) keeps working so upgrades
    don't orphan anyone's projects; otherwise use the per-user platform data
    directory so pipx/uvx runs don't scatter data across working directories.
    """
    legacy = Path("data")
    if legacy.is_dir():
        return legacy
    return Path(platformdirs.user_data_dir("optimal-task-planner", appauthor=False))


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    data_dir: Path = Path("data")
    days: int = 14  # planning horizon length in days
    solver_time_limit_s: float = 20.0

    @classmethod
    def from_env(cls) -> Settings:
        env_data_dir = os.environ.get("OPTIMAL_TASK_PLANNER_DATA_DIR")
        return cls(
            host=os.environ.get("OPTIMAL_TASK_PLANNER_HOST", cls.host),
            port=int(os.environ.get("OPTIMAL_TASK_PLANNER_PORT", str(cls.port))),
            data_dir=Path(env_data_dir) if env_data_dir else default_data_dir(),
            days=int(os.environ.get("OPTIMAL_TASK_PLANNER_DAYS", str(cls.days))),
            solver_time_limit_s=float(
                os.environ.get(
                    "OPTIMAL_TASK_PLANNER_SOLVER_TIME_LIMIT", str(cls.solver_time_limit_s)
                )
            ),
        )
