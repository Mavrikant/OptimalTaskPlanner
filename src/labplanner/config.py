"""Server-level settings, read from environment variables.

Project-level settings that users edit in the UI (working hours, public
holidays) are part of the project data instead — see ``models.WorkCalendar``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    host: str = "127.0.0.1"
    port: int = 8000
    data_dir: Path = Path("data")
    days: int = 14  # planning horizon length in days
    solver_time_limit_s: float = 20.0

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            host=os.environ.get("LABPLANNER_HOST", cls.host),
            port=int(os.environ.get("LABPLANNER_PORT", str(cls.port))),
            data_dir=Path(os.environ.get("LABPLANNER_DATA_DIR", str(cls.data_dir))),
            days=int(os.environ.get("LABPLANNER_DAYS", str(cls.days))),
            solver_time_limit_s=float(
                os.environ.get("LABPLANNER_SOLVER_TIME_LIMIT", str(cls.solver_time_limit_s))
            ),
        )
