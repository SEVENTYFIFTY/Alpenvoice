"""Atelier Studio Board web server.

Run:  uvicorn architect_dashboard.app:app --host 0.0.0.0 --port 8000
Wall display:  http://<server>:8000/          Updates:  http://<server>:8000/#manage
"""
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import config, db, excel_io, gdrive, gmail, notify, progress
from .phases import DRAWING_STAGES, PHASE_STATUSES, PROJECT_STATUSES, TEMPLATES

STATIC = Path(__file__).parent / "static"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@asynccontextmanager
async def lifespan(_app):
    db.init_db()
    gdrive.start_background_sync()
    gmail.start_background_sync()
    yield


app = FastAPI(title="Atelier Studio Board", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


# ---------------------------------------------------------------------------
# Request bodies
# ---------------------------------------------------------------------------

class MemberIn(BaseModel):
    name: str = Field(min_length=1)
    role: Optional[str] = None
    email: Optional[str] = None


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None


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
    blocker: Optional[str] = None
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


class MoveIn(BaseModel):
    phase_name: Optional[str] = None  # None = mark the project complete
    member_id: Optional[int] = None
    create_draft: bool = False        # also save the notification as a draft in the mover's Gmail


class MilestoneIn(BaseModel):
    title: Optional[str] = None
    due_date: Optional[date] = None
    done: Optional[bool] = None
    position: Optional[int] = None
    member_id: Optional[int] = None


class ContactIn(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    kind: Optional[str] = None
    role: Optional[str] = None
    notify: Optional[bool] = None


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
        data = progress.dashboard(conn)
        data["mail"] = [_mail_row(t) for t in db.mail_threads(conn, awaiting_only=True)]
        return data


@app.get("/api/meta")
def get_meta():
    return {
        "templates": {k: v["label"] for k, v in TEMPLATES.items()},
        "default_template": config.DEFAULT_PHASE_TEMPLATE,
        "drawing_stages": DRAWING_STAGES,
        "phase_statuses": PHASE_STATUSES,
        "project_statuses": PROJECT_STATUSES,
        "contact_kinds": db.CONTACT_KINDS,
        "gdrive_configured": gdrive.is_configured(),
        "gmail_configured": gmail.is_configured(),
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


@app.patch("/api/members/{member_id}")
def edit_member(member_id: int, body: MemberUpdate):
    with db.connect() as conn:
        _require(db.get_member(conn, member_id), "Team member not found")
        db.update_member(conn, member_id, _fields(body))
    return {"ok": True}


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
    # no template given -> the office default; "none" (or empty) -> start without phases
    template = data.pop("template", db.DEFAULT)
    if template in ("none", "", None):
        template = None
    if not data.get("code") or not data.get("name"):
        raise HTTPException(422, "Project code and name are required")
    if template != db.DEFAULT:
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
        summary["milestones"] = db.list_milestones(conn, project_id)
        summary["contacts"] = db.list_contacts(conn, project_id)
        summary["mail"] = [_mail_row(t) for t in db.mail_threads(conn, project_id)]
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


@app.post("/api/projects/{project_id}/move")
def move_project(project_id: int, body: MoveIn):
    """Board drag & drop: make a phase current (or finish the project), and
    return an email draft for the contacts marked 'notify'."""
    with db.connect() as conn:
        project = _require(db.get_project(conn, project_id), "Project not found")
        phases = db.list_phases(conn, project_id)
        if body.phase_name is None:
            changes = []
            for phase in phases:
                if phase["progress"] < 100:
                    db.set_phase_progress(conn, phase["id"], 100, note="Project complete",
                                          member_id=body.member_id, source="board")
                    changes.append(f"{phase['name']}: {phase['progress']:.0f}% → 100%")
            return {"changes": changes, "email": None}
        target = next((p for p in phases if p["name"] == body.phase_name), None)
        if target is None:
            raise HTTPException(422, f"{project['code']} has no phase called '{body.phase_name}'")
        changes = db.move_to_phase(conn, project_id, target["id"], member_id=body.member_id)
        contacts = db.list_contacts(conn, project_id)
        sender = db.get_member(conn, body.member_id) if body.member_id else None
        email = notify.phase_change_email(project, target, contacts, sender)
    if not email["to"]:
        return {"changes": changes, "email": None}
    if body.create_draft and body.member_id:
        # outside the transaction above: the move is saved even if Gmail is unreachable
        try:
            email["gmail_draft"] = gmail.create_draft(body.member_id, email["to"], email["subject"], email["body"])
        except gmail.GmailError as exc:
            email["draft_error"] = str(exc)
    return {"changes": changes, "email": email}


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
# Milestones
# ---------------------------------------------------------------------------

@app.post("/api/phases/{phase_id}/milestones", status_code=201)
def add_milestone(phase_id: int, body: MilestoneIn):
    data = _fields(body)
    if not (data.get("title") or "").strip():
        raise HTTPException(422, "Milestone title is required")
    with db.connect() as conn:
        _require(db.get_phase(conn, phase_id), "Phase not found")
        return {"id": db.upsert_milestone(conn, phase_id, data["title"].strip(), data.get("due_date"),
                                          data.get("done"), member_id=data.get("member_id"))}


@app.patch("/api/milestones/{milestone_id}")
def edit_milestone(milestone_id: int, body: MilestoneIn):
    with db.connect() as conn:
        milestone = _require(db.get_milestone(conn, milestone_id), "Milestone not found")
        db.update_milestone(conn, milestone_id, _fields(body))
        phase = db.get_phase(conn, milestone["phase_id"])
    return {"ok": True, "phase_progress": phase["progress"]}


@app.delete("/api/milestones/{milestone_id}")
def remove_milestone(milestone_id: int):
    with db.connect() as conn:
        _require(db.get_milestone(conn, milestone_id), "Milestone not found")
        db.delete_milestone(conn, milestone_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

@app.post("/api/projects/{project_id}/contacts", status_code=201)
def add_contact(project_id: int, body: ContactIn):
    data = _fields(body)
    if not (data.get("name") or "").strip():
        raise HTTPException(422, "Contact name is required")
    _check(data.get("kind"), db.CONTACT_KINDS, "contact type")
    with db.connect() as conn:
        _require(db.get_project(conn, project_id), "Project not found")
        return {"id": db.upsert_contact(conn, project_id, data)}


@app.patch("/api/contacts/{contact_id}")
def edit_contact(contact_id: int, body: ContactIn):
    data = _fields(body)
    _check(data.get("kind"), db.CONTACT_KINDS, "contact type")
    with db.connect() as conn:
        _require(db.get_contact(conn, contact_id), "Contact not found")
        db.update_contact(conn, contact_id, data)
    return {"ok": True}


@app.delete("/api/contacts/{contact_id}")
def remove_contact(contact_id: int):
    with db.connect() as conn:
        _require(db.get_contact(conn, contact_id), "Contact not found")
        db.delete_contact(conn, contact_id)
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


# ---------------------------------------------------------------------------
# Gmail
# ---------------------------------------------------------------------------

def _mail_row(t: dict) -> dict:
    return {
        "project_id": t["project_id"], "project_code": t["project_code"], "project_name": t["project_name"],
        "subject": t["subject"], "from_name": t["from_name"], "from_email": t["from_email"],
        "last_message_at": t["last_message_at"], "message_count": t["message_count"],
        "awaiting_reply": bool(t["awaiting_reply"]), "mailbox_owner": t["mailbox_owner"],
        "url": gmail.thread_url(t["mailbox"], t["thread_id"]),
    }


@app.get("/api/gmail/status")
def gmail_status():
    with db.connect() as conn:
        accounts = db.list_gmail_accounts(conn)
    return {
        "configured": gmail.is_configured(),
        "missing": gmail.missing_settings(),
        "redirect_uri": gmail.redirect_uri(),
        "accounts": accounts,
    }


@app.get("/api/gmail/connect", include_in_schema=False)
def gmail_connect(member_id: int):
    with db.connect() as conn:
        member = _require(db.get_member(conn, member_id), "Team member not found")
    try:
        return RedirectResponse(gmail.authorization_url(member_id, login_hint=member["email"]))
    except gmail.GmailError as exc:
        raise HTTPException(400, str(exc))


@app.get("/api/gmail/callback", include_in_schema=False)
def gmail_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error or not code or not state:
        return RedirectResponse("/?gmail=cancelled#data")
    try:
        account = gmail.complete_connection(code, state)
    except gmail.GmailError as exc:
        return RedirectResponse(f"/?gmail_error={quote(str(exc))}#data")
    gmail.sync_account(account["member_id"])
    return RedirectResponse("/?gmail=connected#data")


@app.post("/api/gmail/sync")
def gmail_sync():
    if not gmail.is_configured():
        raise HTTPException(400, "Gmail is not configured. Missing: " + ", ".join(gmail.missing_settings()))
    return {"results": gmail.sync_all()}


@app.delete("/api/gmail/accounts/{member_id}")
def gmail_disconnect(member_id: int):
    gmail.disconnect(member_id)
    return {"ok": True}
