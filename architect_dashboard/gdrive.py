"""Google Drive integration.

Authenticates with a service account (GOOGLE_SERVICE_ACCOUNT_FILE). Share the
project folders and the tracking spreadsheet with the service account's email
address (read access is enough).

- Spreadsheets (Google Sheets or uploaded .xlsx) registered as sync sources are
  pulled and run through the same importer as an Excel upload.
- A project's Drive folder is listed so its latest documents and plans show up
  next to the project.
"""
import logging
import re
import threading
import time
from typing import Optional

from . import config, db, excel_io

log = logging.getLogger(__name__)

API = "https://www.googleapis.com/drive/v3"
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
SHEET_MIME = "application/vnd.google-apps.spreadsheet"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
FOLDER_MIME = "application/vnd.google-apps.folder"

_session = None


class DriveError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(config.GOOGLE_SERVICE_ACCOUNT_FILE)


def extract_id(value: str) -> str:
    """Accept a raw file/folder ID or any Drive / Sheets share link."""
    value = (value or "").strip()
    for pattern in (r"/d/([A-Za-z0-9_-]{10,})", r"/folders/([A-Za-z0-9_-]{10,})", r"[?&]id=([A-Za-z0-9_-]{10,})"):
        match = re.search(pattern, value)
        if match:
            return match.group(1)
    if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", value):
        raise DriveError("Not a Google Drive link or file ID")
    return value


def session():
    """An authorised requests session (cached)."""
    global _session
    if _session is None:
        if not is_configured():
            raise DriveError("Google Drive is not configured — set GOOGLE_SERVICE_ACCOUNT_FILE")
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account

        credentials = service_account.Credentials.from_service_account_file(
            config.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
        )
        _session = AuthorizedSession(credentials)
    return _session


def _get(path: str, **params):
    response = session().get(f"{API}{path}", params={"supportsAllDrives": "true", **params}, timeout=60)
    if response.status_code != 200:
        try:
            message = response.json()["error"]["message"]
        except Exception:
            message = response.text[:200]
        raise DriveError(f"Drive API {response.status_code}: {message}")
    return response


def file_metadata(file_id: str) -> dict:
    return _get(f"/files/{file_id}", fields="id,name,mimeType,modifiedTime,webViewLink").json()


def download_spreadsheet(file_id: str) -> tuple[dict, bytes]:
    """Return (metadata, xlsx bytes) — Google Sheets are exported to .xlsx."""
    meta = file_metadata(file_id)
    if meta["mimeType"] == SHEET_MIME:
        content = _get(f"/files/{file_id}/export", mimeType=XLSX_MIME).content
    elif meta["mimeType"] == XLSX_MIME:
        content = _get(f"/files/{file_id}", alt="media").content
    else:
        raise DriveError(f"'{meta['name']}' is not a spreadsheet ({meta['mimeType']})")
    return meta, content


def list_folder(folder_id: str, limit: int = 20) -> list[dict]:
    data = _get(
        "/files",
        q=f"'{folder_id}' in parents and trashed = false",
        orderBy="modifiedTime desc",
        pageSize=limit,
        fields="files(id,name,mimeType,modifiedTime,webViewLink,iconLink,lastModifyingUser(displayName))",
        includeItemsFromAllDrives="true",
    ).json()
    return [
        {
            "id": f["id"],
            "name": f["name"],
            "is_folder": f["mimeType"] == FOLDER_MIME,
            "mime_type": f["mimeType"],
            "modified": f.get("modifiedTime"),
            "modified_by": (f.get("lastModifyingUser") or {}).get("displayName"),
            "url": f.get("webViewLink"),
        }
        for f in data.get("files", [])
    ]


def sync_source(source: dict) -> str:
    """Pull one registered spreadsheet and import it. Returns a summary line."""
    try:
        meta, content = download_spreadsheet(source["file_id"])
        with db.connect() as conn:
            report = excel_io.import_workbook(conn, content, source="gdrive")
            if not source.get("name"):
                conn.execute("UPDATE sync_sources SET name = ? WHERE id = ?", (meta["name"], source["id"]))
            result = "OK: " + report.summary()
            db.record_sync(conn, source["id"], result)
            db.bump_version(conn)
        return result
    except Exception as exc:  # recorded so the UI can show what went wrong
        result = f"Error: {exc}"
        with db.connect() as conn:
            db.record_sync(conn, source["id"], result)
        return result


def sync_all() -> list[str]:
    with db.connect() as conn:
        sources = db.list_sync_sources(conn)
    return [sync_source(s) for s in sources]


def start_background_sync() -> Optional[threading.Thread]:
    if not is_configured() or config.GDRIVE_SYNC_MINUTES <= 0:
        return None

    def loop():
        while True:
            try:
                for line in sync_all():
                    log.info("Drive sync: %s", line)
            except Exception:
                log.exception("Drive sync failed")
            time.sleep(config.GDRIVE_SYNC_MINUTES * 60)

    thread = threading.Thread(target=loop, name="gdrive-sync", daemon=True)
    thread.start()
    return thread
