import sqlite3
import json
from datetime import datetime, timedelta
from typing import Optional
import config


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS prospects (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name        TEXT NOT NULL,
            industry            TEXT,
            contact_name        TEXT,
            contact_email       TEXT NOT NULL,
            contact_phone       TEXT,
            website             TEXT,
            location            TEXT,
            status              TEXT DEFAULT 'new',
            follow_up_count     INTEGER DEFAULT 0,
            last_contacted_at   TEXT,
            next_follow_up_date TEXT,
            notes               TEXT,
            created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at          TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS activities (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            prospect_id  INTEGER NOT NULL,
            activity_type TEXT NOT NULL,
            description  TEXT,
            metadata     TEXT,
            created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (prospect_id) REFERENCES prospects(id)
        );
    """)
    conn.commit()
    conn.close()


def add_prospect(
    company_name: str,
    contact_email: str,
    industry: str = "",
    contact_name: str = "",
    contact_phone: str = "",
    website: str = "",
    location: str = "",
    notes: str = "",
) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO prospects
          (company_name, industry, contact_name, contact_email,
           contact_phone, website, location, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (company_name, industry, contact_name, contact_email,
         contact_phone, website, location, notes),
    )
    pid = cursor.lastrowid
    conn.commit()
    conn.close()
    return pid


def get_prospect_by_id(prospect_id: int) -> Optional[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM prospects WHERE id = ?", (prospect_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_prospects() -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM prospects ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_prospects_due(status_filter: str = "all", limit: int = 10) -> list[dict]:
    """Return prospects ready for initial outreach or follow-up."""
    conn = get_connection()
    cursor = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")

    if status_filter == "new":
        cursor.execute(
            "SELECT * FROM prospects WHERE status = 'new' ORDER BY created_at LIMIT ?",
            (limit,),
        )
    elif status_filter == "follow_up":
        cursor.execute(
            """
            SELECT * FROM prospects
            WHERE status IN ('contacted', 'follow_up_1')
              AND (next_follow_up_date IS NULL OR next_follow_up_date <= ?)
            ORDER BY next_follow_up_date ASC
            LIMIT ?
            """,
            (today, limit),
        )
    else:  # all
        cursor.execute(
            """
            SELECT * FROM prospects
            WHERE status = 'new'
               OR (status IN ('contacted', 'follow_up_1')
                   AND (next_follow_up_date IS NULL OR next_follow_up_date <= ?))
            ORDER BY
              CASE status WHEN 'new' THEN 0 ELSE 1 END,
              next_follow_up_date ASC
            LIMIT ?
            """,
            (today, limit),
        )

    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_prospect_status(
    prospect_id: int,
    status: str,
    notes: str = "",
    follow_up_days: int = 0,
) -> bool:
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT notes, follow_up_count FROM prospects WHERE id = ?", (prospect_id,)
    )
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False

    now = datetime.now().isoformat()
    existing_notes = row["notes"] or ""
    follow_up_count = row["follow_up_count"] or 0

    new_notes = (
        f"{existing_notes}\n[{now[:10]}] {notes}".strip() if notes else existing_notes
    )
    new_follow_up_count = (
        follow_up_count + 1 if status in ("follow_up_1", "follow_up_2") else follow_up_count
    )
    next_follow_up = (
        (datetime.now() + timedelta(days=follow_up_days)).strftime("%Y-%m-%d")
        if follow_up_days and follow_up_days > 0
        else None
    )

    cursor.execute(
        """
        UPDATE prospects SET
            status              = ?,
            notes               = ?,
            last_contacted_at   = ?,
            next_follow_up_date = ?,
            follow_up_count     = ?,
            updated_at          = ?
        WHERE id = ?
        """,
        (status, new_notes, now, next_follow_up, new_follow_up_count, now, prospect_id),
    )
    success = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return success


def log_activity(
    prospect_id: int,
    activity_type: str,
    description: str,
    metadata: dict = None,
) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO activities (prospect_id, activity_type, description, metadata)
        VALUES (?, ?, ?, ?)
        """,
        (prospect_id, activity_type, description,
         json.dumps(metadata) if metadata else None),
    )
    aid = cursor.lastrowid
    conn.commit()
    conn.close()
    return aid


def get_activities(prospect_id: int = None, limit: int = 50) -> list[dict]:
    conn = get_connection()
    cursor = conn.cursor()
    if prospect_id:
        cursor.execute(
            """
            SELECT a.*, p.company_name
            FROM activities a
            JOIN prospects p ON a.prospect_id = p.id
            WHERE a.prospect_id = ?
            ORDER BY a.created_at DESC
            LIMIT ?
            """,
            (prospect_id, limit),
        )
    else:
        cursor.execute(
            """
            SELECT a.*, p.company_name
            FROM activities a
            JOIN prospects p ON a.prospect_id = p.id
            ORDER BY a.created_at DESC
            LIMIT ?
            """,
            (limit,),
        )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]
