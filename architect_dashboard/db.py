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


def init_db() -> None:
    with connect() as conn:
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


def member_id_by_name(conn, name: Optional[str]) -> Optional[int]:
    if not name:
        return None
    return upsert_member(conn, name.strip())


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

PROJECT_FIELDS = ("code", "name", "client", "location", "lead_id", "status",
                  "start_date", "due_date", "drive_folder_id", "notes")


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


def create_project(conn, data: dict, template: Optional[str] = None) -> int:
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
