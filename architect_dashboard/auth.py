"""Sign-in, roles, invites and wall-display links.

Roles (members.access):
  admin   the principal: team, roles, integrations, imports, deletions
  member  the team: updates projects, phases, milestones, drawings, contacts
  viewer  read-only
A display link gives a wall screen a read-only session without a person's login.

Passwords are hashed with scrypt. Sessions, invites and display links are random
tokens; only their SHA-256 hashes are stored, so a copy of the database can't be
used to sign in.
"""
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional

from . import db

ROLES = ("viewer", "member", "admin")
SESSION_COOKIE = "atelier_session"
SESSION_DAYS = 30
DISPLAY_SESSION_DAYS = 400      # wall screens stay signed in; revoke the link to sign them out
INVITE_DAYS = 7
MIN_PASSWORD = 10

# Brute-force protection: attempts per email within the window
MAX_FAILURES = 8
FAILURE_WINDOW = 15 * 60
_failures: dict[str, list[float]] = {}


class AuthError(Exception):
    pass


def rank(role: Optional[str]) -> int:
    return ROLES.index(role) + 1 if role in ROLES else 0


# ---------------------------------------------------------------------------
# Passwords and tokens
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: Optional[str]) -> bool:
    try:
        scheme, salt, digest = (stored or "").split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1)
    return hmac.compare_digest(candidate.hex(), digest)


def validate_password(password: str) -> None:
    if len(password or "") < MIN_PASSWORD:
        raise AuthError(f"Use at least {MIN_PASSWORD} characters")


def _token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, _hash(token)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _expires(days: int) -> str:
    return (datetime.now() + timedelta(days=days)).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

def has_accounts(conn) -> bool:
    return conn.execute("SELECT 1 FROM members WHERE password_hash IS NOT NULL LIMIT 1").fetchone() is not None


def create_first_admin(conn, name: str, email: str, password: str) -> int:
    """Only allowed while nobody can sign in yet (fresh install)."""
    if has_accounts(conn):
        raise AuthError("Setup is already complete")
    email = (email or "").strip().lower()
    if "@" not in email:
        raise AuthError("Enter a valid email address")
    validate_password(password)
    existing = conn.execute("SELECT id FROM members WHERE lower(email) = ? OR name = ?", (email, name.strip())).fetchone()
    member_id = existing["id"] if existing else db.upsert_member(conn, name.strip())
    conn.execute("UPDATE members SET email = ?, access = 'admin', password_hash = ? WHERE id = ?",
                 (email, hash_password(password), member_id))
    return member_id


def _throttled(key: str) -> bool:
    now = time.time()
    recent = [t for t in _failures.get(key, []) if now - t < FAILURE_WINDOW]
    _failures[key] = recent
    return len(recent) >= MAX_FAILURES


def login(conn, email: str, password: str) -> str:
    """Check credentials and open a session. Returns the session token for the cookie."""
    key = (email or "").strip().lower()
    if _throttled(key):
        raise AuthError("Too many attempts. Wait 15 minutes and try again.")
    row = conn.execute(
        "SELECT id, access, password_hash FROM members WHERE lower(email) = ? AND password_hash IS NOT NULL",
        (key,),
    ).fetchone()
    if not row or not check_password(password or "", row["password_hash"]) or not row["access"]:
        _failures.setdefault(key, []).append(time.time())
        raise AuthError("Wrong email or password")
    _failures.pop(key, None)
    return open_session(conn, member_id=row["id"])


def open_session(conn, member_id: int = None, display_id: int = None) -> str:
    token, token_hash = _token()
    days = DISPLAY_SESSION_DAYS if display_id else SESSION_DAYS
    conn.execute("INSERT INTO sessions (token_hash, member_id, display_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
                 (token_hash, member_id, display_id, db.now(), _expires(days)))
    return token


def logout(conn, token: Optional[str]) -> None:
    if token:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash(token),))


def session_user(conn, token: Optional[str]) -> Optional[dict]:
    """The signed-in person (or wall display) behind a session cookie, or None."""
    if not token:
        return None
    row = conn.execute("SELECT * FROM sessions WHERE token_hash = ?", (_hash(token),)).fetchone()
    if not row:
        return None
    if row["expires_at"] < db.now():
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (row["token_hash"],))
        return None
    if row["display_id"]:
        link = conn.execute("SELECT id, label FROM display_links WHERE id = ?", (row["display_id"],)).fetchone()
        if not link:
            return None
        conn.execute("UPDATE display_links SET last_used_at = ? WHERE id = ?", (db.now(), link["id"]))
        return {"id": None, "name": link["label"], "access": "viewer", "display": True}
    member = db.get_member(conn, row["member_id"])
    if not member or not member["access"]:
        return None  # access was removed after sign-in
    return {"id": member["id"], "name": member["name"], "email": member["email"], "access": member["access"],
            "display": False}


def end_sessions_for(conn, member_id: int) -> None:
    conn.execute("DELETE FROM sessions WHERE member_id = ?", (member_id,))


def set_access(conn, member_id: int, access: Optional[str]) -> None:
    if access is not None and access not in ROLES:
        raise AuthError(f"Unknown role '{access}'")
    if access != "admin":
        admins = conn.execute("SELECT COUNT(*) FROM members WHERE access = 'admin' AND password_hash IS NOT NULL AND id != ?",
                              (member_id,)).fetchone()[0]
        current = db.get_member(conn, member_id)
        if current and current["access"] == "admin" and admins == 0:
            raise AuthError("Atelier needs at least one principal (admin) who can sign in")
    conn.execute("UPDATE members SET access = ? WHERE id = ?", (access, member_id))
    if access is None:
        end_sessions_for(conn, member_id)


# ---------------------------------------------------------------------------
# Invites (also used for password resets)
# ---------------------------------------------------------------------------

def create_invite(conn, member_id: int) -> str:
    conn.execute("DELETE FROM invites WHERE member_id = ?", (member_id,))  # only the newest link works
    token, token_hash = _token()
    conn.execute("INSERT INTO invites (token_hash, member_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                 (token_hash, member_id, db.now(), _expires(INVITE_DAYS)))
    return token


def invite_member(conn, token: str) -> dict:
    row = conn.execute("SELECT * FROM invites WHERE token_hash = ?", (_hash(token or ""),)).fetchone()
    if not row or row["expires_at"] < db.now():
        raise AuthError("This link has expired or was already used. Ask the principal for a new one.")
    return db.get_member(conn, row["member_id"])


def accept_invite(conn, token: str, password: str) -> str:
    member = invite_member(conn, token)
    validate_password(password)
    if not member["email"]:
        raise AuthError("Your profile has no email address yet. Ask the principal to add it.")
    conn.execute("UPDATE members SET password_hash = ?, access = COALESCE(access, 'member') WHERE id = ?",
                 (hash_password(password), member["id"]))
    conn.execute("DELETE FROM invites WHERE member_id = ?", (member["id"],))
    end_sessions_for(conn, member["id"])  # a reset signs out every other browser
    return open_session(conn, member_id=member["id"])


def change_password(conn, member_id: int, current: str, new: str) -> None:
    row = conn.execute("SELECT password_hash FROM members WHERE id = ?", (member_id,)).fetchone()
    if not row or not check_password(current or "", row["password_hash"]):
        raise AuthError("Current password is wrong")
    validate_password(new)
    conn.execute("UPDATE members SET password_hash = ? WHERE id = ?", (hash_password(new), member_id))


# ---------------------------------------------------------------------------
# Wall display links
# ---------------------------------------------------------------------------

def create_display_link(conn, label: str, created_by: int) -> str:
    token, token_hash = _token()
    conn.execute("INSERT INTO display_links (token_hash, label, created_by, created_at) VALUES (?, ?, ?, ?)",
                 (token_hash, label.strip() or "Wall display", created_by, db.now()))
    return token


def display_link_id(conn, token: str) -> Optional[int]:
    row = conn.execute("SELECT id FROM display_links WHERE token_hash = ?", (_hash(token or ""),)).fetchone()
    return row["id"] if row else None


def list_display_links(conn) -> list[dict]:
    return db.rows(conn.execute(
        """SELECT d.id, d.label, d.created_at, d.last_used_at, m.name AS created_by
           FROM display_links d LEFT JOIN members m ON m.id = d.created_by ORDER BY d.id"""
    ))


def revoke_display_link(conn, link_id: int) -> None:
    conn.execute("DELETE FROM display_links WHERE id = ?", (link_id,))  # sessions cascade


# ---------------------------------------------------------------------------
# Command line: recovery when nobody can sign in
#   python -m architect_dashboard.auth invite you@studio.ch [--admin]
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    from . import config

    parser = argparse.ArgumentParser(description="Print a one-time link to set a password.")
    parser.add_argument("command", choices=["invite"])
    parser.add_argument("email")
    parser.add_argument("--admin", action="store_true", help="also make this person a principal (admin)")
    args = parser.parse_args()
    db.init_db()
    with db.connect() as conn:
        row = conn.execute("SELECT id, name FROM members WHERE lower(email) = ?", (args.email.lower(),)).fetchone()
        if row is None:
            raise SystemExit(f"No team member with email {args.email}")
        if args.admin:
            conn.execute("UPDATE members SET access = 'admin' WHERE id = ?", (row["id"],))
        else:
            conn.execute("UPDATE members SET access = COALESCE(access, 'member') WHERE id = ?", (row["id"],))
        token = create_invite(conn, row["id"])
    print(f"Link for {row['name']} (valid {INVITE_DAYS} days):\n{config.PUBLIC_BASE_URL}/#invite={token}")
