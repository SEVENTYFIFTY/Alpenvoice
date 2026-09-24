"""Gmail integration.

Each team member connects their own mailbox with Google OAuth. Atelier then:

- finds recent threads with each project's contacts and flags the ones where
  the contact wrote last ("waiting on us"). Only headers are read and stored:
  sender, subject, date, never message bodies.
- saves phase-change emails as drafts in the mover's Gmail, ready to review
  and send. Atelier never sends email itself.

Tokens are encrypted at rest with a key derived from STUDIO_SECRET_KEY.
"""
import base64
import hashlib
import hmac
import logging
import secrets
import threading
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, parseaddr
from typing import Optional
from urllib.parse import quote, urlencode

import requests

from . import config, db

log = logging.getLogger(__name__)

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
API = "https://gmail.googleapis.com/gmail/v1/users/me"
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",  # find threads with project contacts
    "https://www.googleapis.com/auth/gmail.compose",   # save phase-change drafts
]
STATE_MAX_AGE = 15 * 60
QUERY_CHUNK = 20      # contact addresses per Gmail search
MAX_THREADS = 100     # per search

http = requests.Session()  # replaced in tests


class GmailError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(config.GOOGLE_OAUTH_CLIENT_ID and config.GOOGLE_OAUTH_CLIENT_SECRET and config.STUDIO_SECRET_KEY)


def missing_settings() -> list[str]:
    return [name for name in ("GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "STUDIO_SECRET_KEY")
            if not getattr(config, name)]


def redirect_uri() -> str:
    return f"{config.PUBLIC_BASE_URL}/api/gmail/callback"


# ---------------------------------------------------------------------------
# Secrets: token encryption and OAuth state signing
# ---------------------------------------------------------------------------

def _fernet():
    from cryptography.fernet import Fernet
    key = base64.urlsafe_b64encode(hashlib.sha256(("atelier-tokens:" + config.STUDIO_SECRET_KEY).encode()).digest())
    return Fernet(key)


def encrypt(value: Optional[str]) -> Optional[str]:
    return _fernet().encrypt(value.encode()).decode() if value else None


def decrypt(value: Optional[str]) -> Optional[str]:
    return _fernet().decrypt(value.encode()).decode() if value else None


def _sign(payload: str) -> str:
    key = hashlib.sha256(("atelier-state:" + config.STUDIO_SECRET_KEY).encode()).digest()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()[:32]


def make_state(member_id: int) -> str:
    payload = f"{member_id}.{int(time.time())}.{secrets.token_urlsafe(8)}"
    return f"{payload}.{_sign(payload)}"


def read_state(state: str) -> int:
    """Return the member id the OAuth round-trip was started for, or raise."""
    try:
        member_id, issued, nonce, signature = state.split(".")
    except (AttributeError, ValueError):
        raise GmailError("Invalid sign-in state")
    payload = f"{member_id}.{issued}.{nonce}"
    if not hmac.compare_digest(signature, _sign(payload)):
        raise GmailError("Invalid sign-in state")
    if time.time() - int(issued) > STATE_MAX_AGE:
        raise GmailError("The Gmail sign-in took too long, please try again")
    return int(member_id)


# ---------------------------------------------------------------------------
# OAuth
# ---------------------------------------------------------------------------

def authorization_url(member_id: int, login_hint: str = None) -> str:
    if not is_configured():
        raise GmailError("Gmail is not configured. Missing: " + ", ".join(missing_settings()))
    params = {
        "client_id": config.GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",      # we need a refresh token for background sync
        "prompt": "consent",           # always return a refresh token, even on reconnect
        "include_granted_scopes": "true",
        "state": make_state(member_id),
    }
    if login_hint:
        params["login_hint"] = login_hint
    return f"{AUTH_URL}?{urlencode(params)}"


def _token_request(data: dict) -> dict:
    response = http.post(TOKEN_URL, data={
        "client_id": config.GOOGLE_OAUTH_CLIENT_ID,
        "client_secret": config.GOOGLE_OAUTH_CLIENT_SECRET,
        **data,
    }, timeout=30)
    body = _json(response)
    if response.status_code != 200:
        raise GmailError(f"Google sign-in failed: {body.get('error_description') or body.get('error') or response.status_code}")
    return body


def complete_connection(code: str, state: str) -> dict:
    """OAuth callback: exchange the code, look up the mailbox address, store the account."""
    member_id = read_state(state)
    tokens = _token_request({"code": code, "grant_type": "authorization_code", "redirect_uri": redirect_uri()})
    if "refresh_token" not in tokens:
        raise GmailError("Google did not return offline access. Remove Atelier under "
                         "myaccount.google.com/permissions and connect again.")
    profile = _api("GET", "/profile", token=tokens["access_token"])
    with db.connect() as conn:
        if db.get_member(conn, member_id) is None:
            raise GmailError("Unknown team member")
        conn.execute(
            """INSERT INTO gmail_accounts (member_id, email, refresh_token, access_token, token_expires_at, connected_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(member_id) DO UPDATE SET email = excluded.email, refresh_token = excluded.refresh_token,
                 access_token = excluded.access_token, token_expires_at = excluded.token_expires_at,
                 connected_at = excluded.connected_at, last_result = NULL""",
            (member_id, profile["emailAddress"], encrypt(tokens["refresh_token"]), encrypt(tokens["access_token"]),
             time.time() + int(tokens.get("expires_in", 3600)) - 60, db.now()),
        )
    return {"member_id": member_id, "email": profile["emailAddress"]}


def access_token(member_id: int) -> str:
    with db.connect() as conn:
        account = db.get_gmail_account(conn, member_id)
    if account is None:
        raise GmailError("Gmail is not connected for this team member")
    if account["access_token"] and (account["token_expires_at"] or 0) > time.time():
        return decrypt(account["access_token"])
    try:
        tokens = _token_request({"refresh_token": decrypt(account["refresh_token"]), "grant_type": "refresh_token"})
    except GmailError as exc:
        raise GmailError(f"{str(exc).rstrip('.')}. Reconnect Gmail under Data & sync.")
    with db.connect() as conn:
        conn.execute("UPDATE gmail_accounts SET access_token = ?, token_expires_at = ? WHERE member_id = ?",
                     (encrypt(tokens["access_token"]), time.time() + int(tokens.get("expires_in", 3600)) - 60, member_id))
    return tokens["access_token"]


def disconnect(member_id: int) -> None:
    with db.connect() as conn:
        account = db.get_gmail_account(conn, member_id)
        if account is None:
            return
        conn.execute("DELETE FROM gmail_accounts WHERE member_id = ?", (member_id,))
    try:  # best effort: also withdraw Atelier's access on Google's side
        http.post(REVOKE_URL, params={"token": decrypt(account["refresh_token"])}, timeout=15)
    except Exception:
        log.warning("Could not revoke Gmail token for member %s", member_id)


# ---------------------------------------------------------------------------
# Gmail API
# ---------------------------------------------------------------------------

def _json(response) -> dict:
    try:
        return response.json()
    except Exception:
        return {}


def _api(method: str, path: str, member_id: int = None, token: str = None, **kwargs) -> dict:
    token = token or access_token(member_id)
    response = http.request(method, f"{API}{path}", headers={"Authorization": f"Bearer {token}"}, timeout=30, **kwargs)
    body = _json(response)
    if response.status_code >= 300:
        message = (body.get("error") or {}).get("message") if isinstance(body.get("error"), dict) else body.get("error")
        raise GmailError(f"Gmail API {response.status_code}: {message or 'request failed'}")
    return body


def _headers(message: dict) -> dict:
    return {h["name"].lower(): h["value"] for h in message.get("payload", {}).get("headers", [])}


def summarise_thread(thread: dict, own_email: str, directory: dict[str, list[dict]]) -> Optional[dict]:
    """Turn a Gmail thread (metadata format) into a mail_threads row, or None when it
    involves none of the project contacts."""
    messages = [m for m in thread.get("messages", []) if "DRAFT" not in m.get("labelIds", [])]
    if not messages:
        return None
    own_email = own_email.lower()

    involved: list[dict] = []  # contacts in the thread, most recent message first
    for message in reversed(messages):
        h = _headers(message)
        addresses = [parseaddr(a)[1].lower() for field in ("from", "to", "cc") for a in h.get(field, "").split(",")]
        for address in addresses:
            for entry in directory.get(address, []):
                if entry not in involved:
                    involved.append(entry)
    if not involved:
        return None

    first, last = _headers(messages[0]), _headers(messages[-1])
    subject = first.get("subject") or last.get("subject") or "(no subject)"
    # The project code in the subject wins when a contact works on several projects
    project = next((c for c in involved if c["code"] and c["code"].lower() in subject.lower()), involved[0])
    from_name, from_email = parseaddr(last.get("from", ""))
    from_email = from_email.lower()
    sent_at = datetime.fromtimestamp(int(messages[-1].get("internalDate", "0")) / 1000, tz=timezone.utc)
    awaiting = from_email != own_email and from_email in directory
    return {
        "thread_id": thread["id"],
        "project_id": project["project_id"],
        "contact_id": next((c["contact_id"] for c in directory.get(from_email, [])
                            if c["project_id"] == project["project_id"]), None),
        "subject": subject,
        "from_name": from_name or from_email,
        "from_email": from_email,
        "last_message_at": sent_at.astimezone().replace(tzinfo=None).isoformat(timespec="seconds"),
        "last_message_id": last.get("message-id"),
        "message_count": len(messages),
        "awaiting_reply": awaiting,
    }


def sync_account(member_id: int) -> str:
    """Refresh one mailbox's project threads. Returns a summary line (also stored)."""
    try:
        with db.connect() as conn:
            account = db.get_gmail_account(conn, member_id)
            contacts = db.contact_directory(conn)
        if account is None:
            raise GmailError("Gmail is not connected")
        directory: dict[str, list[dict]] = {}
        for c in contacts:
            directory.setdefault(c["email"], []).append(c)

        thread_ids: list[str] = []
        emails = sorted(directory)
        for i in range(0, len(emails), QUERY_CHUNK):
            chunk = emails[i:i + QUERY_CHUNK]
            query = "{" + " ".join(f"from:{e} to:{e}" for e in chunk) + "}" + f" newer_than:{config.GMAIL_LOOKBACK_DAYS}d"
            listing = _api("GET", "/threads", member_id, params={"q": query, "maxResults": MAX_THREADS})
            for t in listing.get("threads", []):
                if t["id"] not in thread_ids:
                    thread_ids.append(t["id"])

        rows = []
        for thread_id in thread_ids:
            thread = _api("GET", f"/threads/{thread_id}", member_id, params=[
                ("format", "metadata"), ("metadataHeaders", "From"), ("metadataHeaders", "To"),
                ("metadataHeaders", "Cc"), ("metadataHeaders", "Subject"), ("metadataHeaders", "Message-ID"),
            ])
            row = summarise_thread(thread, account["email"], directory)
            if row:
                rows.append(row)

        waiting = sum(1 for r in rows if r["awaiting_reply"])
        result = f"OK: {len(rows)} project threads, {waiting} waiting on a reply"
        with db.connect() as conn:
            db.replace_mail_threads(conn, member_id, rows)
            conn.execute("UPDATE gmail_accounts SET last_synced_at = ?, last_result = ? WHERE member_id = ?",
                         (db.now(), result, member_id))
        return result
    except Exception as exc:
        result = f"Error: {exc}"
        with db.connect() as conn:
            conn.execute("UPDATE gmail_accounts SET last_synced_at = ?, last_result = ? WHERE member_id = ?",
                         (db.now(), result, member_id))
        return result


def sync_all() -> list[str]:
    with db.connect() as conn:
        accounts = db.list_gmail_accounts(conn)
    return [f"{a['member_name']}: {sync_account(a['member_id'])}" for a in accounts]


def create_draft(member_id: int, to: list[dict], subject: str, body: str) -> dict:
    """Save an email as a draft in the member's Gmail. Returns the link that opens it."""
    with db.connect() as conn:
        account = db.get_gmail_account(conn, member_id)
    if account is None:
        raise GmailError("Gmail is not connected for this team member")
    message = EmailMessage()
    message["To"] = ", ".join(formataddr((t["name"], t["email"])) for t in to)
    message["From"] = account["email"]
    message["Subject"] = subject
    message.set_content(body)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    draft = _api("POST", "/drafts", member_id, json={"message": {"raw": raw}})
    message_id = draft.get("message", {}).get("id", "")
    return {
        "id": draft.get("id"),
        "mailbox": account["email"],
        "url": f"https://mail.google.com/mail/u/{quote(account['email'])}/#drafts?compose={message_id}",
    }


def thread_url(mailbox: str, thread_id: str) -> str:
    return f"https://mail.google.com/mail/u/{quote(mailbox)}/#all/{thread_id}"


def start_background_sync() -> Optional[threading.Thread]:
    if not is_configured() or config.GMAIL_SYNC_MINUTES <= 0:
        return None

    def loop():
        while True:
            try:
                for line in sync_all():
                    log.info("Gmail sync: %s", line)
            except Exception:
                log.exception("Gmail sync failed")
            time.sleep(config.GMAIL_SYNC_MINUTES * 60)

    thread = threading.Thread(target=loop, name="gmail-sync", daemon=True)
    thread.start()
    return thread
