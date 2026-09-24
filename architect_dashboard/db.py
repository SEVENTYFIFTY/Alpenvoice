import sqlite3
from contextlib import contextmanager
from datetime import datetime
from typing import Iterator, Optional

from . import config
from .phases import DRAWING_STAGES, TEMPLATES

SCHEMA = """
CREATE TABLE IF NOT EXISTS members (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    role       TEXT,
    email      TEXT,
    status     TEXT,  -- what they're working on right now
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    client          TEXT,
    location        TEXT,
    lead_id         INTEGER REFERENCES members(id) ON DELETE SET NULL,
    status          TEXT DEFAULT 'active',
    start_date      TEXT,
    due_date        TEXT,
    drive_folder_id TEXT,
    notes           TEXT,
    blocker         TEXT,  -- what the project is waiting on, if anything
    blocker_since   TEXT,
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS phases (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code          TEXT,
    name          TEXT NOT NULL,
    position      INTEGER NOT NULL DEFAULT 0,
    weight        REAL NOT NULL DEFAULT 1,
    planned_start TEXT,
    planned_end   TEXT,
    progress      REAL NOT NULL DEFAULT 0,
    status        TEXT DEFAULT 'not_started',
    assignee_id   INTEGER REFERENCES members(id) ON DELETE SET NULL,
    updated_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS drawings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_id    INTEGER REFERENCES phases(id) ON DELETE SET NULL,
    number      TEXT NOT NULL,
    title       TEXT,
    discipline  TEXT,
    scale       TEXT,
    revision    TEXT,
    stage       TEXT DEFAULT 'not_started',
    progress    REAL NOT NULL DEFAULT 0,
    assignee_id INTEGER REFERENCES members(id) ON DELETE SET NULL,
    due_date    TEXT,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (project_id, number)
);

-- Every progress change, so the dashboard can show daily movement and trends.
CREATE TABLE IF NOT EXISTS progress_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_id   INTEGER REFERENCES phases(id) ON DELETE CASCADE,
    drawing_id INTEGER REFERENCES drawings(id) ON DELETE CASCADE,
    progress   REAL NOT NULL,
    note       TEXT,
    member_id  INTEGER REFERENCES members(id) ON DELETE SET NULL,
    source     TEXT DEFAULT 'manual',
    logged_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_log_project ON progress_log(project_id, logged_at);

-- Checklist items inside a phase. When a phase has milestones, ticking them sets its progress.
CREATE TABLE IF NOT EXISTS milestones (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    phase_id   INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    position   INTEGER NOT NULL DEFAULT 0,
    due_date   TEXT,
    done       INTEGER NOT NULL DEFAULT 0,
    done_at    TEXT,
    UNIQUE (phase_id, title)
);

-- Clients, consultants and authorities on a project.
CREATE TABLE IF NOT EXISTS contacts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    email      TEXT,
    phone      TEXT,
    kind       TEXT NOT NULL DEFAULT 'client',  -- client | consultant | authority | contractor
    role       TEXT,
    notify     INTEGER NOT NULL DEFAULT 0,      -- email them when the project changes phase
    UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS sync_sources (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    kind           TEXT NOT NULL DEFAULT 'gdrive',
    file_id        TEXT NOT NULL UNIQUE,
    name           TEXT,
    last_synced_at TEXT,
    last_result    TEXT
);
"""


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# Columns added after the first release; created on databases that predate them.
MIGRATIONS = {
    "members": {"status": "TEXT"},
    "projects": {"blocker": "TEXT", "blocker_since": "TEXT"},
}


def init_db() -> None:
    with connect() as conn:
        for table, columns in MIGRATIONS.items():
            existing = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})")}
            if not existing:
                continue  # table is created fresh by the schema below
            for column, kind in columns.items():
                if column not in existing:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")
        conn.executescript(SCHEMA)


def now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def rows(cursor) -> list[dict]:
    return [dict(r) for r in cursor.fetchall()]


def clamp(value: float) -> float:
    return max(0.0, min(100.0, float(value)))


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

def list_members(conn) -> list[dict]:
    return rows(conn.execute("SELECT * FROM members ORDER BY name"))


def upsert_member(conn, name: str, role: str = None, email: str = None) -> int:
    existing = conn.execute("SELECT id FROM members WHERE name = ?", (name,)).fetchone()
    if existing:
        conn.execute(
            "UPDATE members SET role = COALESCE(?, role), email = COALESCE(?, email) WHERE id = ?",
            (role, email, existing["id"]),
        )
        return existing["id"]
    return conn.execute(
        "INSERT INTO members (name, role, email) VALUES (?, ?, ?)", (name, role, email)
    ).lastrowid


def update_member(conn, member_id: int, data: dict) -> None:
    values = {k: v for k, v in data.items() if k in ("name", "role", "email", "status")}
    if values:
        assignments = ", ".join(f"{k} = ?" for k in values)
        conn.execute(f"UPDATE members SET {assignments} WHERE id = ?", (*values.values(), member_id))


def get_member(conn, member_id: int) -> Optional[dict]:
    row = conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
    return dict(row) if row else None


def member_id_by_name(conn, name: Optional[str]) -> Optional[int]:
    if not name:
        return None
    return upsert_member(conn, name.strip())


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

PROJECT_FIELDS = ("code", "name", "client", "location", "lead_id", "status",
                  "start_date", "due_date", "drive_folder_id", "notes", "blocker")


def list_projects(conn, include_archived: bool = False) -> list[dict]:
    sql = """SELECT p.*, m.name AS lead_name FROM projects p
             LEFT JOIN members m ON m.id = p.lead_id"""
    if not include_archived:
        sql += " WHERE p.status != 'archived'"
    return rows(conn.execute(sql + " ORDER BY p.due_date IS NULL, p.due_date, p.code"))


def get_project(conn, project_id: int) -> Optional[dict]:
    row = conn.execute(
        """SELECT p.*, m.name AS lead_name FROM projects p
           LEFT JOIN members m ON m.id = p.lead_id WHERE p.id = ?""",
        (project_id,),
    ).fetchone()
    return dict(row) if row else None


def project_id_by_code(conn, code: str) -> Optional[int]:
    row = conn.execute("SELECT id FROM projects WHERE code = ?", (code,)).fetchone()
    return row["id"] if row else None


DEFAULT = "default"  # create_project(template=DEFAULT) uses config.DEFAULT_PHASE_TEMPLATE


def create_project(conn, data: dict, template: Optional[str] = None) -> int:
    """template: a key of TEMPLATES, DEFAULT for the office default, or None for no phases."""
    if template == DEFAULT:
        template = config.DEFAULT_PHASE_TEMPLATE
    values = {k: data.get(k) for k in PROJECT_FIELDS}
    values["status"] = values["status"] or "active"
    cols = ", ".join(values)
    marks = ", ".join("?" for _ in values)
    project_id = conn.execute(
        f"INSERT INTO projects ({cols}) VALUES ({marks})", tuple(values.values())
    ).lastrowid
    if template:
        apply_template(conn, project_id, template)
    return project_id


def update_project(conn, project_id: int, data: dict) -> None:
    values = {k: v for k, v in data.items() if k in PROJECT_FIELDS}
    if not values:
        return
    if "blocker" in values:
        values["blocker"] = (values["blocker"] or "").strip() or None
        current = conn.execute("SELECT blocker, blocker_since FROM projects WHERE id = ?",
                               (project_id,)).fetchone()
        if not values["blocker"]:
            values["blocker_since"] = None
        elif not current or not current["blocker"]:
            values["blocker_since"] = now()
    assignments = ", ".join(f"{k} = ?" for k in values)
    conn.execute(
        f"UPDATE projects SET {assignments}, updated_at = ? WHERE id = ?",
        (*values.values(), now(), project_id),
    )


def delete_project(conn, project_id: int) -> None:
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))


# ---------------------------------------------------------------------------
# Phases
# ---------------------------------------------------------------------------

PHASE_FIELDS = ("code", "name", "position", "weight", "planned_start",
                "planned_end", "status", "assignee_id")


def apply_template(conn, project_id: int, template: str) -> None:
    if template not in TEMPLATES:
        raise ValueError(f"Unknown phase template: {template}")
    for position, phase in enumerate(TEMPLATES[template]["phases"], start=1):
        conn.execute(
            """INSERT OR IGNORE INTO phases (project_id, code, name, position, weight)
               VALUES (?, ?, ?, ?, ?)""",
            (project_id, phase["code"], phase["name"], position, phase["weight"]),
        )


def list_phases(conn, project_id: int) -> list[dict]:
    return rows(conn.execute(
        """SELECT ph.*, m.name AS assignee_name FROM phases ph
           LEFT JOIN members m ON m.id = ph.assignee_id
           WHERE ph.project_id = ? ORDER BY ph.position, ph.id""",
        (project_id,),
    ))


def get_phase(conn, phase_id: int) -> Optional[dict]:
    row = conn.execute("SELECT * FROM phases WHERE id = ?", (phase_id,)).fetchone()
    return dict(row) if row else None


def upsert_phase(conn, project_id: int, data: dict, source: str = "manual") -> int:
    """Create or update a phase (matched by name within the project)."""
    existing = conn.execute(
        "SELECT id FROM phases WHERE project_id = ? AND name = ?", (project_id, data["name"])
    ).fetchone()
    values = {k: data[k] for k in PHASE_FIELDS if k in data and data[k] is not None}
    if existing:
        phase_id = existing["id"]
        if values:
            assignments = ", ".join(f"{k} = ?" for k in values)
            conn.execute(f"UPDATE phases SET {assignments} WHERE id = ?", (*values.values(), phase_id))
    else:
        if "position" not in values:
            values["position"] = conn.execute(
                "SELECT COALESCE(MAX(position), 0) + 1 FROM phases WHERE project_id = ?", (project_id,)
            ).fetchone()[0]
        values["project_id"] = project_id
        cols = ", ".join(values)
        marks = ", ".join("?" for _ in values)
        phase_id = conn.execute(
            f"INSERT INTO phases ({cols}) VALUES ({marks})", tuple(values.values())
        ).lastrowid
    if data.get("progress") is not None:
        set_phase_progress(conn, phase_id, data["progress"], source=source)
    return phase_id


def set_phase_progress(conn, phase_id: int, progress: float, note: str = None,
                       member_id: int = None, source: str = "manual",
                       logged_at: str = None) -> None:
    phase = get_phase(conn, phase_id)
    if phase is None:
        raise KeyError(phase_id)
    progress = clamp(progress)
    if progress == phase["progress"] and not note:
        return  # nothing changed; keep the log free of no-op syncs
    status = phase["status"]
    if progress >= 100:
        status = "done"
    elif progress > 0 and status in ("not_started", "done"):
        status = "in_progress"
    stamp = logged_at or now()
    conn.execute(
        "UPDATE phases SET progress = ?, status = ?, updated_at = ? WHERE id = ?",
        (progress, status, stamp, phase_id),
    )
    conn.execute(
        """INSERT INTO progress_log (project_id, phase_id, progress, note, member_id, source, logged_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (phase["project_id"], phase_id, progress, note, member_id, source, stamp),
    )


def update_phase(conn, phase_id: int, data: dict) -> None:
    values = {k: v for k, v in data.items() if k in PHASE_FIELDS}
    if values:
        assignments = ", ".join(f"{k} = ?" for k in values)
        conn.execute(f"UPDATE phases SET {assignments} WHERE id = ?", (*values.values(), phase_id))
    if data.get("progress") is not None:
        set_phase_progress(conn, phase_id, data["progress"], note=data.get("note"),
                           member_id=data.get("member_id"))


def delete_phase(conn, phase_id: int) -> None:
    conn.execute("DELETE FROM phases WHERE id = ?", (phase_id,))


def move_to_phase(conn, project_id: int, phase_id: int, member_id: int = None) -> list[str]:
    """Make `phase_id` the project's current phase (e.g. dragged on the board).

    Earlier phases are completed, the target phase is reopened if it was done,
    later phases are reset. Returns a description of each change made.
    """
    phases = list_phases(conn, project_id)
    target = next((p for p in phases if p["id"] == phase_id), None)
    if target is None:
        raise KeyError(phase_id)
    note = f"Moved to {target['name']}"
    changes = []
    for phase in phases:
        if phase["position"] < target["position"] or (phase["position"] == target["position"] and phase["id"] < target["id"]):
            new = 100.0
        elif phase["id"] == target["id"]:
            new = 0.0 if phase["progress"] >= 100 else phase["progress"]
        else:
            new = 0.0
        if new != phase["progress"]:
            set_phase_progress(conn, phase["id"], new, note=note, member_id=member_id, source="board")
            changes.append(f"{phase['name']}: {phase['progress']:.0f}% → {new:.0f}%")
        # keep checklists consistent with the jump: finished phases are fully ticked,
        # reset phases fully unticked (a reopened target keeps its ticks unless it was complete)
        if new in (0.0, 100.0) and new != phase["progress"]:
            done = new == 100.0
            conn.execute("UPDATE milestones SET done = ?, done_at = ? WHERE phase_id = ? AND done != ?",
                         (int(done), now() if done else None, phase["id"], int(done)))
        if phase["id"] == target["id"] and phase["status"] != "in_progress":
            conn.execute("UPDATE phases SET status = 'in_progress' WHERE id = ?", (phase["id"],))
    return changes


# ---------------------------------------------------------------------------
# Milestones
# ---------------------------------------------------------------------------

def list_milestones(conn, project_id: int) -> list[dict]:
    return rows(conn.execute(
        """SELECT ms.* FROM milestones ms JOIN phases ph ON ph.id = ms.phase_id
           WHERE ph.project_id = ? ORDER BY ph.position, ph.id, ms.position, ms.id""",
        (project_id,),
    ))


def get_milestone(conn, milestone_id: int) -> Optional[dict]:
    row = conn.execute("SELECT * FROM milestones WHERE id = ?", (milestone_id,)).fetchone()
    return dict(row) if row else None


def upsert_milestone(conn, phase_id: int, title: str, due_date: str = None,
                     done: Optional[bool] = None, member_id: int = None, source: str = "manual") -> int:
    existing = conn.execute("SELECT id FROM milestones WHERE phase_id = ? AND title = ?",
                            (phase_id, title)).fetchone()
    if existing:
        milestone_id = existing["id"]
        if due_date:
            conn.execute("UPDATE milestones SET due_date = ? WHERE id = ?", (due_date, milestone_id))
    else:
        position = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 FROM milestones WHERE phase_id = ?",
                                (phase_id,)).fetchone()[0]
        milestone_id = conn.execute(
            "INSERT INTO milestones (phase_id, title, position, due_date) VALUES (?, ?, ?, ?)",
            (phase_id, title, position, due_date),
        ).lastrowid
    if done is not None:
        set_milestone_done(conn, milestone_id, done, member_id=member_id, source=source)
    elif not existing:
        sync_phase_from_milestones(conn, phase_id, member_id=member_id, source=source)
    return milestone_id


def set_milestone_done(conn, milestone_id: int, done: bool, member_id: int = None,
                       source: str = "manual") -> None:
    milestone = get_milestone(conn, milestone_id)
    if milestone is None:
        raise KeyError(milestone_id)
    if bool(milestone["done"]) == bool(done):
        return
    conn.execute("UPDATE milestones SET done = ?, done_at = ? WHERE id = ?",
                 (1 if done else 0, now() if done else None, milestone_id))
    note = f"{'✓' if done else '↺'} {milestone['title']}"
    sync_phase_from_milestones(conn, milestone["phase_id"], note=note, member_id=member_id, source=source)


def sync_phase_from_milestones(conn, phase_id: int, note: str = None, member_id: int = None,
                               source: str = "manual") -> None:
    """A phase with milestones is exactly as far along as its ticked share."""
    total, done = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(done), 0) FROM milestones WHERE phase_id = ?", (phase_id,)
    ).fetchone()
    if total:
        set_phase_progress(conn, phase_id, done / total * 100, note=note, member_id=member_id, source=source)


def update_milestone(conn, milestone_id: int, data: dict) -> None:
    values = {k: v for k, v in data.items() if k in ("title", "due_date", "position")}
    if values:
        assignments = ", ".join(f"{k} = ?" for k in values)
        conn.execute(f"UPDATE milestones SET {assignments} WHERE id = ?", (*values.values(), milestone_id))
    if data.get("done") is not None:
        set_milestone_done(conn, milestone_id, data["done"], member_id=data.get("member_id"))


def delete_milestone(conn, milestone_id: int) -> None:
    milestone = get_milestone(conn, milestone_id)
    if milestone:
        conn.execute("DELETE FROM milestones WHERE id = ?", (milestone_id,))
        sync_phase_from_milestones(conn, milestone["phase_id"])


# ---------------------------------------------------------------------------
# Contacts
# ---------------------------------------------------------------------------

CONTACT_FIELDS = ("name", "email", "phone", "kind", "role", "notify")
CONTACT_KINDS = ("client", "consultant", "authority", "contractor")


def list_contacts(conn, project_id: int) -> list[dict]:
    return rows(conn.execute(
        """SELECT * FROM contacts WHERE project_id = ?
           ORDER BY CASE kind WHEN 'client' THEN 0 WHEN 'consultant' THEN 1 ELSE 2 END, name""",
        (project_id,),
    ))


def get_contact(conn, contact_id: int) -> Optional[dict]:
    row = conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
    return dict(row) if row else None


def upsert_contact(conn, project_id: int, data: dict) -> int:
    values = {k: data[k] for k in CONTACT_FIELDS if k in data and data[k] is not None}
    if "notify" in values:
        values["notify"] = 1 if values["notify"] else 0
    existing = conn.execute("SELECT id FROM contacts WHERE project_id = ? AND name = ?",
                            (project_id, data["name"])).fetchone()
    if existing:
        assignments = ", ".join(f"{k} = ?" for k in values)
        conn.execute(f"UPDATE contacts SET {assignments} WHERE id = ?", (*values.values(), existing["id"]))
        return existing["id"]
    values["project_id"] = project_id
    cols = ", ".join(values)
    marks = ", ".join("?" for _ in values)
    return conn.execute(f"INSERT INTO contacts ({cols}) VALUES ({marks})", tuple(values.values())).lastrowid


def update_contact(conn, contact_id: int, data: dict) -> None:
    values = {k: v for k, v in data.items() if k in CONTACT_FIELDS}
    if "notify" in values:
        values["notify"] = 1 if values["notify"] else 0
    if values:
        assignments = ", ".join(f"{k} = ?" for k in values)
        conn.execute(f"UPDATE contacts SET {assignments} WHERE id = ?", (*values.values(), contact_id))


def delete_contact(conn, contact_id: int) -> None:
    conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))


# ---------------------------------------------------------------------------
# Drawings
# ---------------------------------------------------------------------------

DRAWING_FIELDS = ("phase_id", "number", "title", "discipline", "scale", "revision",
                  "stage", "assignee_id", "due_date")


def list_drawings(conn, project_id: int) -> list[dict]:
    return rows(conn.execute(
        """SELECT d.*, m.name AS assignee_name, ph.name AS phase_name FROM drawings d
           LEFT JOIN members m ON m.id = d.assignee_id
           LEFT JOIN phases ph ON ph.id = d.phase_id
           WHERE d.project_id = ? ORDER BY d.number""",
        (project_id,),
    ))


def get_drawing(conn, drawing_id: int) -> Optional[dict]:
    row = conn.execute("SELECT * FROM drawings WHERE id = ?", (drawing_id,)).fetchone()
    return dict(row) if row else None


def upsert_drawing(conn, project_id: int, data: dict, source: str = "manual",
                   note: str = None, member_id: int = None) -> int:
    """Create or update a drawing (matched by number within the project)."""
    existing = conn.execute(
        "SELECT * FROM drawings WHERE project_id = ? AND number = ?", (project_id, data["number"])
    ).fetchone()
    values = {k: data[k] for k in DRAWING_FIELDS if k in data and data[k] is not None}
    if values.get("stage") and values["stage"] not in DRAWING_STAGES:
        raise ValueError(f"Unknown drawing stage: {values['stage']}")

    progress = data.get("progress")
    if progress is None and "stage" in values:
        progress = DRAWING_STAGES[values["stage"]]

    if existing:
        drawing_id = existing["id"]
        if values:
            assignments = ", ".join(f"{k} = ?" for k in values)
            conn.execute(f"UPDATE drawings SET {assignments} WHERE id = ?", (*values.values(), drawing_id))
        previous = existing["progress"]
    else:
        values["project_id"] = project_id
        cols = ", ".join(values)
        marks = ", ".join("?" for _ in values)
        drawing_id = conn.execute(
            f"INSERT INTO drawings ({cols}) VALUES ({marks})", tuple(values.values())
        ).lastrowid
        previous = None

    if progress is not None and (clamp(progress) != previous or note):
        stamp = now()
        conn.execute("UPDATE drawings SET progress = ?, updated_at = ? WHERE id = ?",
                     (clamp(progress), stamp, drawing_id))
        conn.execute(
            """INSERT INTO progress_log (project_id, drawing_id, progress, note, member_id, source, logged_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (project_id, drawing_id, clamp(progress), note, member_id, source, stamp),
        )
    return drawing_id


def delete_drawing(conn, drawing_id: int) -> None:
    conn.execute("DELETE FROM drawings WHERE id = ?", (drawing_id,))


# ---------------------------------------------------------------------------
# Activity log
# ---------------------------------------------------------------------------

def recent_activity(conn, limit: int = 25) -> list[dict]:
    return rows(conn.execute(
        """SELECT l.*, p.code AS project_code, p.name AS project_name,
                  ph.name AS phase_name, d.number AS drawing_number, d.title AS drawing_title,
                  m.name AS member_name
           FROM progress_log l
           JOIN projects p ON p.id = l.project_id
           LEFT JOIN phases ph ON ph.id = l.phase_id
           LEFT JOIN drawings d ON d.id = l.drawing_id
           LEFT JOIN members m ON m.id = l.member_id
           ORDER BY l.logged_at DESC, l.id DESC LIMIT ?""",
        (limit,),
    ))


def phase_log(conn, project_id: int) -> list[dict]:
    return rows(conn.execute(
        """SELECT phase_id, progress, logged_at FROM progress_log
           WHERE project_id = ? AND phase_id IS NOT NULL ORDER BY logged_at, id""",
        (project_id,),
    ))


# ---------------------------------------------------------------------------
# Sync sources (Google Drive spreadsheets)
# ---------------------------------------------------------------------------

def list_sync_sources(conn) -> list[dict]:
    return rows(conn.execute("SELECT * FROM sync_sources ORDER BY id"))


def add_sync_source(conn, file_id: str, name: str = None) -> int:
    conn.execute("INSERT OR IGNORE INTO sync_sources (file_id, name) VALUES (?, ?)", (file_id, name))
    return conn.execute("SELECT id FROM sync_sources WHERE file_id = ?", (file_id,)).fetchone()["id"]


def record_sync(conn, source_id: int, result: str) -> None:
    conn.execute("UPDATE sync_sources SET last_synced_at = ?, last_result = ? WHERE id = ?",
                 (now(), result, source_id))


def delete_sync_source(conn, source_id: int) -> None:
    conn.execute("DELETE FROM sync_sources WHERE id = ?", (source_id,))
