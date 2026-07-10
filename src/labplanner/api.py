"""FastAPI application: JSON API + serves the static frontend."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, calendar_utils, solver
from .config import Settings
from .models import SLOTS_PER_DAY, Project
from .storage import ProjectStore

STATIC_DIR = Path(__file__).parent / "static"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = ProjectStore(settings.data_dir)
    app = FastAPI(title="LabPlanner", version=__version__)

    def horizon_info(project: Project) -> dict:
        now = datetime.now()
        start = calendar_utils.horizon_start(now)
        cal = project.calendar
        holidays_set = set(cal.holidays)
        day_dates = [(start + timedelta(days=d)).date().isoformat()
                     for d in range(settings.days)]
        return {
            "now": now.isoformat(timespec="minutes"),
            "start_date": start.date().isoformat(),
            "days": settings.days,
            "slots_per_day": SLOTS_PER_DAY,
            "horizon_slots": settings.days * SLOTS_PER_DAY,
            "now_slot": calendar_utils.first_free_slot(now),
            "work_start_slot": cal.work_start_slot,
            "work_end_slot": cal.work_end_slot,
            "day_dates": day_dates,
            "day_weekdays": [(start + timedelta(days=d)).weekday()
                             for d in range(settings.days)],
            "holiday_flags": [d in holidays_set for d in day_dates],
        }

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok", "version": __version__}

    @app.get("/api/project")
    def get_project() -> dict:
        project = store.load()
        return {"project": project.model_dump(), "horizon": horizon_info(project)}

    @app.put("/api/project")
    def put_project(project: Project) -> dict:
        store.save(project)
        return {"ok": True, "horizon": horizon_info(project)}

    @app.post("/api/solve")
    def solve_now() -> dict:
        project = store.load()
        try:
            schedule = solver.solve(
                project, days=settings.days, time_limit_s=settings.solver_time_limit_s
            )
        except Exception as e:  # surface solver bugs as readable errors
            raise HTTPException(status_code=500, detail=str(e)) from e
        project.schedule = schedule
        store.save(project)
        return {"schedule": schedule.model_dump(), "horizon": horizon_info(project)}

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
