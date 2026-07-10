"""File-based persistence: multiple projects per data directory, stored as JSON.

Layout::

    data_dir/projects/<id>.json    one project per file (its name lives inside)
    data_dir/backups/<id>/<ts>.json  automatic snapshots (newest BACKUP_KEEP kept)

The legacy single-file layout (``data_dir/project.json``) is migrated
automatically the first time the store is used.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import time
import uuid
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from .models import SCHEMA_VERSION, Project

BACKUP_MIN_INTERVAL_S = 10 * 60  # at most one time-based snapshot per 10 minutes
BACKUP_KEEP = 20
_BACKUP_NAME = re.compile(r"^\d{8}-\d{6}-\d{6}\.json$")


def default_project(name: str = "My lab") -> Project:
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
    return Project.model_validate({"name": name, "equipment": equipment, "tasks": tasks})


# ---------------------------------------------------------------- migrations

def _migrate_v1(raw: dict) -> dict:
    """v1 -> v2: single-file era projects had no name / schema_version."""
    raw.setdefault("name", "My lab")
    return raw


def _migrate_v2(raw: dict) -> dict:
    """v2 -> v3: per-project solver options (model defaults fill the rest)."""
    raw.setdefault("solver", {})
    return raw


MIGRATIONS: dict[int, Callable[[dict], dict]] = {
    1: _migrate_v1,
    2: _migrate_v2,
}


def migrate(raw: dict) -> dict:
    """Bring a raw project dict up to the current schema version."""
    version = raw.get("schema_version", 1)
    while version < SCHEMA_VERSION:
        step = MIGRATIONS.get(version)
        if step is None:  # future-proofing: unknown gap, let validation decide
            break
        raw = step(raw)
        version += 1
    raw["schema_version"] = SCHEMA_VERSION
    return raw


# ------------------------------------------------------------------- store

class ProjectStore:
    def __init__(self, data_dir: Path | str):
        self.data_dir = Path(data_dir)
        self.projects_dir = self.data_dir / "projects"
        self.backups_dir = self.data_dir / "backups"

    # -- paths & existence

    def _path(self, pid: str) -> Path:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", pid):
            raise FileNotFoundError(pid)
        return self.projects_dir / f"{pid}.json"

    def exists(self, pid: str) -> bool:
        try:
            return self._path(pid).exists()
        except FileNotFoundError:
            return False

    # -- listing / CRUD

    def list(self) -> list[dict]:
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        out = []
        for path in self.projects_dir.glob("*.json"):
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            out.append({
                "id": path.stem,
                "name": raw.get("name", path.stem),
                "updated_at": datetime.fromtimestamp(path.stat().st_mtime)
                .isoformat(timespec="seconds"),
            })
        return sorted(out, key=lambda p: p["name"].lower())

    def create(self, name: str, project: Project | None = None) -> str:
        pid = uuid.uuid4().hex[:12]
        proj = project if project is not None else Project(name=name)
        proj.name = name or proj.name
        self._write(pid, proj)
        return pid

    def load(self, pid: str) -> Project:
        path = self._path(pid)
        if not path.exists():
            raise FileNotFoundError(pid)
        with open(path, encoding="utf-8") as f:
            raw = json.load(f)
        return Project.model_validate(migrate(raw))

    def save(self, pid: str, project: Project) -> None:
        if not self.exists(pid):
            raise FileNotFoundError(pid)
        self._snapshot(pid)  # time-based, at most every BACKUP_MIN_INTERVAL_S
        self._write(pid, project)

    def delete(self, pid: str) -> None:
        path = self._path(pid)
        if not path.exists():
            raise FileNotFoundError(pid)
        self._snapshot(pid, force=True)
        path.unlink()

    def duplicate(self, pid: str) -> str:
        project = self.load(pid)
        project.name = f"{project.name} (copy)"
        project.schedule = None
        return self.create(project.name, project)

    def import_data(self, raw: dict) -> str:
        """Validate a full project payload and store it as a new project."""
        project = Project.model_validate(migrate(dict(raw)))
        return self.create(project.name, project)

    def ensure_default(self) -> None:
        """Migrate the legacy single-file layout, or seed a sample project."""
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        if any(self.projects_dir.glob("*.json")):
            return
        legacy = self.data_dir / "project.json"
        if legacy.exists():
            with open(legacy, encoding="utf-8") as f:
                raw = json.load(f)
            project = Project.model_validate(migrate(raw))
            pid = self.create(project.name, project)
            self._snapshot(pid, force=True)
            legacy.rename(legacy.with_name("project.json.migrated"))
        else:
            self.create("My lab", default_project())

    # -- backups

    def _backup_dir(self, pid: str) -> Path:
        return self.backups_dir / pid

    def _snapshot(self, pid: str, force: bool = False) -> None:
        path = self._path(pid)
        if not path.exists():
            return
        bdir = self._backup_dir(pid)
        bdir.mkdir(parents=True, exist_ok=True)
        if not force:
            newest = max((f.stat().st_mtime for f in bdir.glob("*.json")), default=0.0)
            if time.time() - newest < BACKUP_MIN_INTERVAL_S:
                return
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        shutil.copy2(path, bdir / f"{stamp}.json")
        self._prune(pid)

    def _prune(self, pid: str) -> None:
        backups = sorted(self._backup_dir(pid).glob("*.json"),
                         key=lambda f: f.name, reverse=True)
        for stale in backups[BACKUP_KEEP:]:
            stale.unlink()

    def list_backups(self, pid: str) -> list[dict]:
        if not self.exists(pid):
            raise FileNotFoundError(pid)
        bdir = self._backup_dir(pid)
        if not bdir.exists():
            return []
        out = []
        for path in sorted(bdir.glob("*.json"), key=lambda f: f.name, reverse=True):
            stamp = path.stem  # YYYYmmdd-HHMMSS-ffffff
            try:
                created = datetime.strptime(stamp, "%Y%m%d-%H%M%S-%f")
            except ValueError:
                continue
            out.append({"name": path.name,
                        "created_at": created.isoformat(timespec="seconds")})
        return out

    def restore_backup(self, pid: str, name: str) -> None:
        if not _BACKUP_NAME.fullmatch(name):
            raise FileNotFoundError(name)
        backup = self._backup_dir(pid) / name
        if not backup.exists() or not self.exists(pid):
            raise FileNotFoundError(name)
        with open(backup, encoding="utf-8") as f:
            raw = json.load(f)
        project = Project.model_validate(migrate(raw))
        self._snapshot(pid, force=True)  # keep the pre-restore state recoverable
        self._write(pid, project)

    # -- low-level atomic write

    def _write(self, pid: str, project: Project) -> None:
        self.projects_dir.mkdir(parents=True, exist_ok=True)
        project.schema_version = SCHEMA_VERSION
        fd, tmp = tempfile.mkstemp(dir=self.projects_dir, suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(project.model_dump(), f, indent=2, ensure_ascii=False)
            os.replace(tmp, self._path(pid))
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
