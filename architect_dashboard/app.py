"""Atelier Studio Board web server.

Run:  uvicorn architect_dashboard.app:app --host 0.0.0.0 --port 8000
Open http://<server>:8000/: the first visit sets up the principal's account.
"""
import re
import asyncio
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import auth, config, db, excel_io, gdrive, gmail, notify, progress
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
# Access control
# ---------------------------------------------------------------------------

# Reachable without signing in
PUBLIC = re.compile(r"^/(|static/.*|display/[^/]+|api/auth/(me|login|logout|setup|invite/[^/]+))$")

# (methods, path, minimum role). First match wins; otherwise reading needs "viewer"
# and changing anything needs "member".
RULES = [
    ({"POST"}, r"/api/members", "admin"),
    ({"POST"}, r"/api/members/\d+/invite", "admin"),
    ({"PUT"}, r"/api/members/\d+/access", "admin"),
    ({"DELETE"}, r"/api/projects/\d+", "admin"),
    ({"POST"}, r"/api/import/excel", "admin"),
    ({"POST", "DELETE"}, r"/api/gdrive/sources(/\d+)?", "admin"),
    ({"GET", "POST", "DELETE"}, r"/api/auth/display-links(/\d+)?", "admin"),
    ({"GET"}, r"/api/export/excel", "member"),     # includes contact details
    ({"GET"}, r"/api/gmail/(connect|callback)", "member"),
    ({"GET"}, r"/(docs|redoc|openapi\.json)", "member"),
]
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
CSRF_HEADER = "x-atelier"


def required_role(method: str, path: str) -> str:
    for methods, pattern, role in RULES:
        if method in methods and re.fullmatch(pattern, path):
            return role
    return "viewer" if method in SAFE_METHODS else "member"


@app.middleware("http")
async def access_control(request: Request, call_next):
    method, path = request.method, request.url.path
    # Changes must come from the app's own scripts: browsers can't add this header to a
    # cross-site form post or image load, which blocks cross-site request forgery.
    if method not in SAFE_METHODS and path.startswith("/api/") and request.headers.get(CSRF_HEADER) != "1":
        return JSONResponse({"detail": "Missing X-Atelier header"}, status_code=403)
    with db.connect() as conn:
        user = auth.session_user(conn, request.cookies.get(auth.SESSION_COOKIE))
    request.state.user = user
    if PUBLIC.match(path):
        return await call_next(request)
    if user is None:
        if method == "GET" and not path.startswith("/api/"):
            return RedirectResponse("/")
        return JSONResponse({"detail": "Sign in to continue"}, status_code=401)
    role = required_role(method, path)
    if auth.rank(user["access"]) < auth.rank(role):
        return JSONResponse({"detail": "You don't have permission to do that"}, status_code=403)
    response = await call_next(request)
    if method not in SAFE_METHODS and response.status_code < 400 and not path.startswith("/api/auth/"):
        await run_in_threadpool(_changed)
    return response


def _changed() -> None:
    with db.connect() as conn:
        db.bump_version(conn)


def current_user(request: Request) -> dict:
    return request.state.user


def _set_session(response: Response, token: str, days: int = auth.SESSION_DAYS) -> Response:
    response.set_cookie(auth.SESSION_COOKIE, token, max_age=days * 86400, httponly=True, samesite="lax",
                        secure=config.PUBLIC_BASE_URL.startswith("https://"), path="/")
    return response


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


class AccessIn(BaseModel):
    access: Optional[str] = None  # admin | member | viewer | None (no login)


class LoginIn(BaseModel):
    email: str
    password: str


class SetupIn(BaseModel):
    name: str = Field(min_length=1)
    email: str
    password: str


class PasswordIn(BaseModel):
    password: str
    current: Optional[str] = None


class DisplayLinkIn(BaseModel):
    label: str = "Wall display"


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
        member_id = db.upsert_member(conn, body.name.strip(), body.role,
                                     body.email.strip().lower() if body.email else None)
        return {"id": member_id}


@app.patch("/api/members/{member_id}")
def edit_member(member_id: int, body: MemberUpdate, request: Request):
    user, data = current_user(request), _fields(body)
    if user["access"] != "admin" and (member_id != user["id"] or set(data) - {"status"}):
        raise HTTPException(403, "You can only update your own status")
    if data.get("email"):
        data["email"] = data["email"].strip().lower()
    with db.connect() as conn:
        _require(db.get_member(conn, member_id), "Team member not found")
        db.update_member(conn, member_id, data)
    return {"ok": True}


@app.put("/api/members/{member_id}/access")
def set_member_access(member_id: int, body: AccessIn, request: Request):
    with db.connect() as conn:
        _require(db.get_member(conn, member_id), "Team member not found")
        try:
            auth.set_access(conn, member_id, body.access)
        except auth.AuthError as exc:
            raise HTTPException(422, str(exc))
    return {"ok": True}


@app.post("/api/members/{member_id}/invite")
def invite_member(member_id: int):
    """One-time link for the person to set their password (also a password reset)."""
    with db.connect() as conn:
        member = _require(db.get_member(conn, member_id), "Team member not found")
        if not member["email"]:
            raise HTTPException(422, f"Add an email address for {member['name']} first")
        if not member["access"]:
            auth.set_access(conn, member_id, "member")
        token = auth.create_invite(conn, member_id)
    return {"url": f"{config.PUBLIC_BASE_URL}/#invite={token}", "expires_in_days": auth.INVITE_DAYS}


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
def move_project(project_id: int, body: MoveIn, request: Request):
    """Board drag & drop: make a phase current (or finish the project), and
    return an email draft for the contacts marked 'notify'."""
    body.member_id = current_user(request)["id"]  # whoever is signed in made the move
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
def edit_phase(phase_id: int, body: PhaseIn, request: Request):
    data = {**_fields(body), "member_id": current_user(request)["id"]}
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
def add_milestone(phase_id: int, body: MilestoneIn, request: Request):
    data = {**_fields(body), "member_id": current_user(request)["id"]}
    if not (data.get("title") or "").strip():
        raise HTTPException(422, "Milestone title is required")
    with db.connect() as conn:
        _require(db.get_phase(conn, phase_id), "Phase not found")
        return {"id": db.upsert_milestone(conn, phase_id, data["title"].strip(), data.get("due_date"),
                                          data.get("done"), member_id=data.get("member_id"))}


@app.patch("/api/milestones/{milestone_id}")
def edit_milestone(milestone_id: int, body: MilestoneIn, request: Request):
    with db.connect() as conn:
        milestone = _require(db.get_milestone(conn, milestone_id), "Milestone not found")
        db.update_milestone(conn, milestone_id, {**_fields(body), "member_id": current_user(request)["id"]})
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
def add_drawing(project_id: int, body: DrawingIn, request: Request):
    data = {**_fields(body), "member_id": current_user(request)["id"]}
    if not data.get("number"):
        raise HTTPException(422, "Drawing number is required")
    _check(data.get("stage"), DRAWING_STAGES, "stage")
    with db.connect() as conn:
        _require(db.get_project(conn, project_id), "Project not found")
        drawing_id = db.upsert_drawing(conn, project_id, data, note=data.get("note"),
                                       member_id=data.get("member_id"))
        return {"id": drawing_id}


@app.patch("/api/drawings/{drawing_id}")
def edit_drawing(drawing_id: int, body: DrawingIn, request: Request):
    data = {**_fields(body), "member_id": current_user(request)["id"]}
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
def gmail_connect(request: Request):
    member_id = current_user(request)["id"]  # you can only connect your own mailbox
    with db.connect() as conn:
        member = _require(db.get_member(conn, member_id), "Team member not found")
    try:
        return RedirectResponse(gmail.authorization_url(member_id, login_hint=member["email"]))
    except gmail.GmailError as exc:
        raise HTTPException(400, str(exc))


@app.get("/api/gmail/callback", include_in_schema=False)
def gmail_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None,
                   error: Optional[str] = None):
    if error or not code or not state:
        return RedirectResponse("/?gmail=cancelled#data")
    try:
        if gmail.read_state(state) != current_user(request)["id"]:
            raise gmail.GmailError("This Gmail sign-in was started by someone else. Please try again.")
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
def gmail_disconnect(member_id: int, request: Request):
    user = current_user(request)
    if user["access"] != "admin" and user["id"] != member_id:
        raise HTTPException(403, "You can only disconnect your own Gmail")
    gmail.disconnect(member_id)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Sign-in
# ---------------------------------------------------------------------------

def _auth_error(exc: auth.AuthError, status: int = 422):
    raise HTTPException(status, str(exc))


@app.get("/api/auth/me")
def whoami(request: Request):
    with db.connect() as conn:
        setup_needed = not auth.has_accounts(conn)
    return {"user": request.state.user, "setup_needed": setup_needed, "office": config.OFFICE_NAME}


@app.post("/api/auth/setup")
def first_setup(body: SetupIn):
    """Fresh install only: create the principal's account."""
    with db.connect() as conn:
        try:
            member_id = auth.create_first_admin(conn, body.name, body.email, body.password)
        except auth.AuthError as exc:
            _auth_error(exc, 409 if "already" in str(exc) else 422)
        token = auth.open_session(conn, member_id=member_id)
    return _set_session(JSONResponse({"ok": True}), token)


@app.post("/api/auth/login")
def sign_in(body: LoginIn):
    with db.connect() as conn:
        try:
            token = auth.login(conn, body.email, body.password)
        except auth.AuthError as exc:
            _auth_error(exc, 401)
    return _set_session(JSONResponse({"ok": True}), token)


@app.post("/api/auth/logout")
def sign_out(request: Request):
    with db.connect() as conn:
        auth.logout(conn, request.cookies.get(auth.SESSION_COOKIE))
    response = JSONResponse({"ok": True})
    response.delete_cookie(auth.SESSION_COOKIE, path="/")
    return response


@app.get("/api/auth/invite/{token}")
def read_invite(token: str):
    with db.connect() as conn:
        try:
            member = auth.invite_member(conn, token)
        except auth.AuthError as exc:
            _auth_error(exc, 404)
    return {"name": member["name"], "email": member["email"], "reset": bool(member["has_password"])}


@app.post("/api/auth/invite/{token}")
def accept_invite(token: str, body: PasswordIn):
    with db.connect() as conn:
        try:
            session = auth.accept_invite(conn, token, body.password)
        except auth.AuthError as exc:
            _auth_error(exc)
    return _set_session(JSONResponse({"ok": True}), session)


@app.post("/api/auth/password")
def change_password(body: PasswordIn, request: Request):
    user = current_user(request)
    if user["display"]:
        raise HTTPException(403, "A wall display has no password")
    with db.connect() as conn:
        try:
            auth.change_password(conn, user["id"], body.current, body.password)
        except auth.AuthError as exc:
            _auth_error(exc)
    return {"ok": True}


@app.get("/api/auth/display-links")
def get_display_links():
    with db.connect() as conn:
        return auth.list_display_links(conn)


@app.post("/api/auth/display-links", status_code=201)
def add_display_link(body: DisplayLinkIn, request: Request):
    with db.connect() as conn:
        token = auth.create_display_link(conn, body.label, current_user(request)["id"])
    return {"url": f"{config.PUBLIC_BASE_URL}/display/{token}"}


@app.delete("/api/auth/display-links/{link_id}")
def remove_display_link(link_id: int):
    with db.connect() as conn:
        auth.revoke_display_link(conn, link_id)
    return {"ok": True}


@app.get("/display/{token}", include_in_schema=False)
def open_display(token: str):
    """A wall screen opens its secret link once and stays signed in, read-only."""
    with db.connect() as conn:
        link_id = auth.display_link_id(conn, token)
        if link_id is None:
            return RedirectResponse("/?display=invalid")
        session = auth.open_session(conn, display_id=link_id)
    return _set_session(RedirectResponse("/#wall"), session, days=auth.DISPLAY_SESSION_DAYS)


# ---------------------------------------------------------------------------
# Live updates (Server-Sent Events)
# ---------------------------------------------------------------------------

EVENT_POLL_SECONDS = 1.5
KEEPALIVE_SECONDS = 25
STREAM_MAX_SECONDS = 15 * 60  # then the browser reconnects by itself; frees stale connections


def _version() -> int:
    with db.connect() as conn:
        return db.data_version(conn)


@app.get("/api/version")
def get_version():
    return {"version": _version()}


@app.get("/api/events")
async def events(request: Request):
    """Streams the data version whenever it changes; dashboards refresh when it does."""
    async def stream():
        last = await run_in_threadpool(_version)
        yield f"retry: 5000\nevent: version\ndata: {last}\n\n"
        quiet, deadline = 0.0, asyncio.get_running_loop().time() + STREAM_MAX_SECONDS
        while asyncio.get_running_loop().time() < deadline and not await request.is_disconnected():
            await asyncio.sleep(EVENT_POLL_SECONDS)
            current = await run_in_threadpool(_version)
            if current != last:
                last, quiet = current, 0.0
                yield f"event: version\ndata: {current}\n\n"
            else:
                quiet += EVENT_POLL_SECONDS
                if quiet >= KEEPALIVE_SECONDS:  # keeps proxies from closing an idle connection
                    quiet = 0.0
                    yield ": keepalive\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
