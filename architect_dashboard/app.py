"""Studio Dashboard web server.

Run:  uvicorn architect_dashboard.app:app --host 0.0.0.0 --port 8000
Wall display:  http://<server>:8000/          Updates:  http://<server>:8000/#manage
"""
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db, excel_io, gdrive, progress
from .phases import DRAWING_STAGES, PHASE_STATUSES, PROJECT_STATUSES, TEMPLATES

STATIC = Path(__file__).parent / "static"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@asynccontextmanager
async def lifespan(_app):
    db.init_db()
    gdrive.start_background_sync()
    yield


app = FastAPI(title="Studio Dashboard", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class MemberIn(BaseModel):
    name: str = Field(min_length=1)
    role: Optional[str] = None
    email: Optional[str] = None


class ProjectIn(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    client: Optional[str] = None
    location: Optional[str] = None
    lead_id: Optional[int] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    drive_folder_id: Optional[str] = None
    notes: Optional[str] = None
    template: Optional[str] = None


class PhaseIn(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    position: Optional[int] = None
    weight: Optional[float] = Field(default=None, ge=0)
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    status: Optional[str] = None
    assignee_id: Optional[int] = None
    progress: Optional[float] = Field(default=None, ge=0, le=100)
    note: Optional[str] = None
    member_id: Optional[int] = None


class DrawingIn(BaseModel):
    number: Optional[str] = None
    title: Optional[str] = None
    phase_id: Optional[int] = None
    discipline: Optional[str] = None
    scale: Optional[str] = None
    revision: Optional[str] = None
    stage: Optional[str] = None
    progress: Optional[float] = Field(default=None, ge=0, le=100)
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None
    note: Optional[str] = None
    member_id: Optional[int] = None


class SyncSourceIn(BaseModel):
    link: str
    name: Optional[str] = None


def _fields(model: BaseModel) -> dict:
    data = model.model_dump(exclude_unset=True)
    return {k: v.isoformat() if isinstance(v, date) else v for k, v in data.items()}


def _check(value, allowed, label):
    if value is not None and value not in allowed:
        raise HTTPException(422, f"Unknown {label} '{value}'. Use one of: {', '.join(allowed)}")


def _require(item, label="Not found"):
    if item is None:
        raise HTTPException(404, label)
    return item


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------

@app.get("/api/dashboard")
def get_dashboard():
    with db.connect() as conn:
        return progress.dashboard(conn)


@app.get("/api/meta")
def get_meta():
    return {
        "templates": {k: v["label"] for k, v in TEMPLATES.items()},
        "drawing_stages": DRAWING_STAGES,
        "phase_statuses": PHASE_STATUSES,
        "project_statuses": PROJECT_STATUSES,
        "gdrive_configured": gdrive.is_configured(),
    }


# ---------------------------------------------------------------------------
# Team
# ---------------------------------------------------------------------------

@app.get("/api/members")
def get_members():
    with db.connect() as conn:
        return db.list_members(conn)


@app.post("/api/members", status_code=201)
def add_member(body: MemberIn):
    with db.connect() as conn:
        member_id = db.upsert_member(conn, body.name.strip(), body.role, body.email)
        return {"id": member_id}


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

@app.get("/api/projects")
def get_projects(include_archived: bool = False):
    with db.connect() as conn:
        return db.list_projects(conn, include_archived)


@app.post("/api/projects", status_code=201)
def add_project(body: ProjectIn):
    data = _fields(body)
    template = data.pop("template", None)
    if not data.get("code") or not data.get("name"):
        raise HTTPException(422, "Project code and name are required")
    _check(template, TEMPLATES, "template")
    _check(data.get("status"), PROJECT_STATUSES, "status")
    if data.get("drive_folder_id"):
        data["drive_folder_id"] = _drive_id(data["drive_folder_id"])
    with db.connect() as conn:
        if db.project_id_by_code(conn, data["code"]):
            raise HTTPException(409, f"Project code {data['code']} already exists")
        return {"id": db.create_project(conn, data, template)}


@app.get("/api/projects/{project_id}")
def get_project(project_id: int):
    with db.connect() as conn:
        project = _require(db.get_project(conn, project_id), "Project not found")
        summary = progress.project_summary(conn, project, date.today())
        summary["drawing_list"] = db.list_drawings(conn, project_id)
        return summary


@app.patch("/api/projects/{project_id}")
def edit_project(project_id: int, body: ProjectIn):
    data = _fields(body)
    template = data.pop("template", None)
    _check(template, TEMPLATES, "template")
    _check(data.get("status"), PROJECT_STATUSES, "status")
    if data.get("drive_folder_id"):
        data["drive_folder_id"] = _drive_id(data["drive_folder_id"])
    with db.connect() as conn:
        _require(db.get_project(conn, project_id), "Project not found")
        db.update_project(conn, project_id, data)
        if template:
            db.apply_template(conn, project_id, template)
    return {"ok": True}


@app.delete("/api/projects/{project_id}")
def remove_project(project_id: int):
    with db.connect() as conn:
        _require(db.get_project(conn, project_id), "Project not found")
        db.delete_project(conn, project_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Phases
# ---------------------------------------------------------------------------

@app.post("/api/projects/{project_id}/phases", status_code=201)
def add_phase(project_id: int, body: PhaseIn):
    data = _fields(body)
    if not data.get("name"):
        raise HTTPException(422, "Phase name is required")
    _check(data.get("status"), PHASE_STATUSES, "status")
    with db.connect() as conn:
        _require(db.get_project(conn, project_id), "Project not found")
        return {"id": db.upsert_phase(conn, project_id, data)}


@app.patch("/api/phases/{phase_id}")
def edit_phase(phase_id: int, body: PhaseIn):
    data = _fields(body)
    _check(data.get("status"), PHASE_STATUSES, "status")
    with db.connect() as conn:
        _require(db.get_phase(conn, phase_id), "Phase not found")
        db.update_phase(conn, phase_id, data)
    return {"ok": True}


@app.delete("/api/phases/{phase_id}")
def remove_phase(phase_id: int):
    with db.connect() as conn:
        _require(db.get_phase(conn, phase_id), "Phase not found")
        db.delete_phase(conn, phase_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Drawings
# ---------------------------------------------------------------------------

@app.post("/api/projects/{project_id}/drawings", status_code=201)
def add_drawing(project_id: int, body: DrawingIn):
    data = _fields(body)
    if not data.get("number"):
        raise HTTPException(422, "Drawing number is required")
    _check(data.get("stage"), DRAWING_STAGES, "stage")
    with db.connect() as conn:
        _require(db.get_project(conn, project_id), "Project not found")
        drawing_id = db.upsert_drawing(conn, project_id, data, note=data.get("note"),
                                       member_id=data.get("member_id"))
        return {"id": drawing_id}


@app.patch("/api/drawings/{drawing_id}")
def edit_drawing(drawing_id: int, body: DrawingIn):
    data = _fields(body)
    _check(data.get("stage"), DRAWING_STAGES, "stage")
    with db.connect() as conn:
        drawing = _require(db.get_drawing(conn, drawing_id), "Drawing not found")
        data["number"] = drawing["number"]  # the number identifies the drawing; not editable here
        db.upsert_drawing(conn, drawing["project_id"], data, note=data.get("note"),
                          member_id=data.get("member_id"))
    return {"ok": True}


@app.delete("/api/drawings/{drawing_id}")
def remove_drawing(drawing_id: int):
    with db.connect() as conn:
        _require(db.get_drawing(conn, drawing_id), "Drawing not found")
        db.delete_drawing(conn, drawing_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Excel
# ---------------------------------------------------------------------------

@app.post("/api/import/excel")
async def import_excel(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(422, "Upload an .xlsx workbook")
    content = await file.read()
    try:
        with db.connect() as conn:
            report = excel_io.import_workbook(conn, content)
    except Exception as exc:
        raise HTTPException(422, f"Could not read workbook: {exc}")
    return {**report, "summary": report.summary()}


@app.get("/api/export/excel")
def export_excel():
    with db.connect() as conn:
        content = excel_io.export_workbook(conn)
    filename = f"studio-projects-{date.today().isoformat()}.xlsx"
    return Response(content, media_type=XLSX,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@app.get("/api/export/template")
def export_template():
    with db.connect() as conn:
        content = excel_io.export_workbook(conn, empty=True)
    return Response(content, media_type=XLSX,
                    headers={"Content-Disposition": 'attachment; filename="studio-import-template.xlsx"'})


# ---------------------------------------------------------------------------
# Google Drive
# ---------------------------------------------------------------------------

def _drive_id(link: str) -> str:
    try:
        return gdrive.extract_id(link)
    except gdrive.DriveError as exc:
        raise HTTPException(422, str(exc))


@app.get("/api/gdrive/sources")
def get_sources():
    with db.connect() as conn:
        return db.list_sync_sources(conn)


@app.post("/api/gdrive/sources", status_code=201)
def add_source(body: SyncSourceIn):
    file_id = _drive_id(body.link)
    with db.connect() as conn:
        source_id = db.add_sync_source(conn, file_id, body.name)
    return {"id": source_id, "file_id": file_id}


@app.delete("/api/gdrive/sources/{source_id}")
def remove_source(source_id: int):
    with db.connect() as conn:
        db.delete_sync_source(conn, source_id)
    return {"ok": True}


@app.post("/api/gdrive/sync")
def run_sync():
    if not gdrive.is_configured():
        raise HTTPException(400, "Google Drive is not configured — set GOOGLE_SERVICE_ACCOUNT_FILE")
    return {"results": gdrive.sync_all()}


@app.get("/api/projects/{project_id}/drive-files")
def project_drive_files(project_id: int):
    with db.connect() as conn:
        project = _require(db.get_project(conn, project_id), "Project not found")
    if not project["drive_folder_id"]:
        return {"files": [], "message": "No Drive folder linked to this project"}
    if not gdrive.is_configured():
        return {"files": [], "message": "Google Drive is not configured"}
    try:
        return {"files": gdrive.list_folder(project["drive_folder_id"])}
    except gdrive.DriveError as exc:
        raise HTTPException(502, str(exc))
