"""FastAPI application: JSON API + serves the static frontend."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError

from . import __version__, calendar_utils, export_xlsx, solver
from .config import Settings
from .models import SLOTS_PER_DAY, Project
from .storage import ProjectStore

STATIC_DIR = Path(__file__).parent / "static"
XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class XlsxExport(BaseModel):
    filename: str = "export.xlsx"
    sheet_name: str = "Sheet1"
    columns: list[str] = Field(default_factory=list)
    rows: list[list] = Field(default_factory=list)


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
        pid = store.create(name)
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

    @app.post("/api/projects/{pid}/solve")
    def solve_now(pid: str) -> dict:
        project = load_or_404(pid)
        try:
            schedule = solver.solve(
                project, days=settings.days, time_limit_s=settings.solver_time_limit_s
            )
        except Exception as e:  # surface solver bugs as readable errors
            raise HTTPException(status_code=500, detail=str(e)) from e
        project.schedule = schedule
        store.save(pid, project)
        return {"schedule": schedule.model_dump(), "horizon": horizon_info(project)}

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

    # ---- exports --------------------------------------------------------------

    @app.post("/api/export/xlsx")
    def export_to_xlsx(payload: XlsxExport) -> Response:
        data = export_xlsx.build_workbook(payload.columns, payload.rows, payload.sheet_name)
        safe = Path(payload.filename).name or "export.xlsx"
        if not safe.lower().endswith(".xlsx"):
            safe += ".xlsx"
        return Response(
            content=data,
            media_type=XLSX_MEDIA_TYPE,
            headers={"Content-Disposition": f'attachment; filename="{safe}"'},
        )

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
