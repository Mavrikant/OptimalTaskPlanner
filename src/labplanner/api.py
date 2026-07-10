"""FastAPI application: JSON API + serves the static frontend."""

from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from . import __version__, calendar_utils, solver
from .config import Settings
from .models import SLOTS_PER_DAY, Project, SolverOptions
from .storage import ProjectStore

STATIC_DIR = Path(__file__).parent / "static"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = ProjectStore(settings.data_dir)
    store.ensure_default()  # migrates the legacy single-file layout if present
    app = FastAPI(title="LabPlanner", version=__version__)

    def load_or_404(pid: str) -> Project:
        try:
            return store.load(pid)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=f"Unknown project: {pid}") from e

    def horizon_info(project: Project) -> dict:
        now = datetime.now()
        start = calendar_utils.horizon_start(now)
        cal = project.calendar
        days = project.solver.days
        holidays_set = set(cal.holidays)
        day_dates = [(start + timedelta(days=d)).date().isoformat()
                     for d in range(days)]
        return {
            "now": now.isoformat(timespec="minutes"),
            "start_date": start.date().isoformat(),
            "days": days,
            "slots_per_day": SLOTS_PER_DAY,
            "horizon_slots": days * SLOTS_PER_DAY,
            "now_slot": calendar_utils.first_free_slot(now),
            "work_start_slot": cal.work_start_slot,
            "work_end_slot": cal.work_end_slot,
            "day_dates": day_dates,
            "day_weekdays": [(start + timedelta(days=d)).weekday()
                             for d in range(settings.days)],
            "holiday_flags": [d in holidays_set for d in day_dates],
        }

    @app.middleware("http")
    async def revalidate_static(request, call_next):
        # ETag/Last-Modified make revalidation cheap (304); heuristic caching would
        # otherwise keep serving stale frontend assets after an upgrade.
        response = await call_next(request)
        if request.url.path == "/" or request.url.path.startswith("/static"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok", "version": __version__}

    # ---- project management -------------------------------------------------

    @app.get("/api/projects")
    def list_projects() -> dict:
        return {"projects": store.list()}

    @app.post("/api/projects")
    def create_project(payload: dict | None = None) -> dict:
        name = str((payload or {}).get("name") or "").strip() or "New project"
        # new projects inherit the server-level defaults (CLI --days / env)
        seed = Project(name=name, solver=SolverOptions(
            days=settings.days, time_limit_s=int(settings.solver_time_limit_s)))
        pid = store.create(name, seed)
        return {"id": pid, "name": name}

    @app.post("/api/projects/import")
    def import_project(payload: dict) -> dict:
        try:
            pid = store.import_data(payload)
        except ValidationError as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        return {"id": pid, "name": store.load(pid).name}

    @app.patch("/api/projects/{pid}")
    def rename_project(pid: str, payload: dict) -> dict:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="name must not be empty")
        project = load_or_404(pid)
        project.name = name
        store.save(pid, project)
        return {"ok": True, "name": name}

    @app.delete("/api/projects/{pid}")
    def delete_project(pid: str) -> dict:
        try:
            store.delete(pid)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=f"Unknown project: {pid}") from e
        return {"ok": True}

    @app.post("/api/projects/{pid}/duplicate")
    def duplicate_project(pid: str) -> dict:
        load_or_404(pid)
        new_pid = store.duplicate(pid)
        return {"id": new_pid, "name": store.load(new_pid).name}

    # ---- project data & solving ---------------------------------------------

    @app.get("/api/projects/{pid}")
    def get_project(pid: str) -> dict:
        project = load_or_404(pid)
        return {"project": project.model_dump(), "horizon": horizon_info(project)}

    @app.put("/api/projects/{pid}")
    def put_project(pid: str, project: Project) -> dict:
        if not store.exists(pid):
            raise HTTPException(status_code=404, detail=f"Unknown project: {pid}")
        store.save(pid, project)
        return {"ok": True, "horizon": horizon_info(project)}

    # Background solve jobs: the solver runs in a thread (OR-Tools releases the
    # GIL) so the server stays responsive, reports progress and can be cancelled.
    jobs: dict[str, dict] = {}
    jobs_lock = threading.Lock()

    def _prune_jobs() -> None:
        cutoff = time.time() - 300  # keep terminal jobs 5 min for late polls
        for jid in [j for j, v in jobs.items()
                    if v["status"] != "running" and v["finished"] < cutoff]:
            jobs.pop(jid, None)

    @app.post("/api/projects/{pid}/solve")
    def solve_now(pid: str) -> dict:
        project = load_or_404(pid)
        job_id = uuid.uuid4().hex[:12]
        cancel = threading.Event()
        job = {
            "id": job_id, "status": "running", "started": time.time(), "finished": 0.0,
            "best_makespan_minutes": None, "schedule": None, "horizon": None,
            "error": None, "cancel": cancel,
        }
        with jobs_lock:
            _prune_jobs()
            jobs[job_id] = job

        def on_progress(mk: int) -> None:
            job["best_makespan_minutes"] = mk

        def run() -> None:
            try:
                schedule = solver.solve(
                    project, days=project.solver.days,
                    time_limit_s=project.solver.time_limit_s,
                    workers=project.solver.workers,
                    progress=on_progress, cancel=cancel,
                )
                if schedule.status == "CANCELLED":
                    job["status"] = "cancelled"
                else:
                    project.schedule = schedule
                    store.save(pid, project)
                    job["schedule"] = schedule.model_dump()
                    job["horizon"] = horizon_info(project)
                    job["status"] = "done"
            except Exception as e:  # surface solver bugs to the poller
                job["error"] = str(e)
                job["status"] = "error"
            finally:
                job["finished"] = time.time()

        threading.Thread(target=run, daemon=True).start()
        return {"job_id": job_id}

    @app.get("/api/solve/{job_id}")
    def solve_status(job_id: str) -> dict:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Unknown solve job")
        elapsed = (time.time() if job["status"] == "running" else job["finished"]) - job["started"]
        out = {
            "status": job["status"],
            "elapsed_s": round(elapsed, 1),
            "best_makespan_minutes": job["best_makespan_minutes"],
        }
        if job["status"] == "done":
            out["schedule"] = job["schedule"]
            out["horizon"] = job["horizon"]
        elif job["status"] == "error":
            out["error"] = job["error"]
        return out

    @app.post("/api/solve/{job_id}/cancel")
    def solve_cancel(job_id: str) -> dict:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Unknown solve job")
        job["cancel"].set()
        return {"ok": True}

    # ---- backups --------------------------------------------------------------

    @app.get("/api/projects/{pid}/backups")
    def list_backups(pid: str) -> dict:
        try:
            return {"backups": store.list_backups(pid)}
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=f"Unknown project: {pid}") from e

    @app.post("/api/projects/{pid}/backups/{name}/restore")
    def restore_backup(pid: str, name: str) -> dict:
        try:
            store.restore_backup(pid, name)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=f"Unknown backup: {name}") from e
        return {"ok": True}

    @app.get("/api/holidays/countries")
    def holiday_countries() -> dict:
        return {"countries": calendar_utils.supported_countries()}

    @app.get("/api/holidays")
    def holidays(
        country: str = Query(min_length=2, max_length=3),
        year: int = Query(ge=1900, le=2200),
    ) -> dict:
        try:
            found = calendar_utils.country_holidays(country, years=[year])
        except NotImplementedError as e:
            raise HTTPException(status_code=400,
                                detail=f"Unsupported country code: {country}") from e
        return {"country": country, "year": year, "holidays": found}

    return app
