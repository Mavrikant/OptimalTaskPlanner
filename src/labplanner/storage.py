"""File-based persistence: one project per data directory, stored as JSON."""

from __future__ import annotations

import json
import os
import tempfile
import uuid
from pathlib import Path

from .models import Project

PROJECT_FILENAME = "project.json"


def default_project() -> Project:
    """A small sample project so first-time users see something working."""
    equipment = [
        {"name": "VSG", "count": 3},
        {"name": "VSA", "count": 2},
        {"name": "Oscilloscope", "count": 2},
        {"name": "Power Supply", "count": 3},
        {"name": "Spectrum Analyzer", "count": 1},
        {"name": "Climatic Chamber", "count": 1},
        {"name": "DMM", "count": 2},
        {"name": "GPS Simulator", "count": 1},
    ]
    tasks = [
        {"id": str(uuid.uuid4()), "name": "RF calibration sweep", "minutes": 240,
         "work_hours_only": True, "continue_next_day": False,
         "resources": {"VSG": 2, "Spectrum Analyzer": 1}, "slots": {}},
        {"id": str(uuid.uuid4()), "name": "Firmware bake (18 h)", "minutes": 1080,
         "work_hours_only": True, "continue_next_day": True,
         "resources": {"Power Supply": 1, "DMM": 1}, "slots": {}},
        {"id": str(uuid.uuid4()), "name": "Environmental soak", "minutes": 2160,
         "work_hours_only": False, "continue_next_day": False,
         "resources": {"Climatic Chamber": 1, "DMM": 1}, "slots": {}},
        {"id": str(uuid.uuid4()), "name": "Receiver sensitivity test", "minutes": 360,
         "work_hours_only": True, "continue_next_day": False,
         "resources": {"VSG": 1, "VSA": 1, "Oscilloscope": 1}, "slots": {}},
        {"id": str(uuid.uuid4()), "name": "GPS scenario replay", "minutes": 480,
         "work_hours_only": False, "continue_next_day": False,
         "resources": {"GPS Simulator": 1, "Oscilloscope": 1}, "slots": {}},
    ]
    return Project.model_validate({"equipment": equipment, "tasks": tasks})


class ProjectStore:
    def __init__(self, data_dir: Path | str):
        self.data_dir = Path(data_dir)
        self.path = self.data_dir / PROJECT_FILENAME

    def load(self) -> Project:
        if not self.path.exists():
            project = default_project()
            self.save(project)
            return project
        with open(self.path, encoding="utf-8") as f:
            return Project.model_validate(json.load(f))

    def save(self, project: Project) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        # atomic write so a crash never corrupts the file
        fd, tmp = tempfile.mkstemp(dir=self.data_dir, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(project.model_dump(), f, indent=2, ensure_ascii=False)
            os.replace(tmp, self.path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
