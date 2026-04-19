import base64
from datetime import datetime
import requests
import config


def _get_access_token() -> tuple[str | None, str | None]:
    """Fetch a Zoom Server-to-Server OAuth token."""
    if not all([config.ZOOM_ACCOUNT_ID, config.ZOOM_CLIENT_ID, config.ZOOM_CLIENT_SECRET]):
        return None, "Zoom credentials not configured (set ZOOM_ACCOUNT_ID / CLIENT_ID / CLIENT_SECRET)"

    creds = base64.b64encode(
        f"{config.ZOOM_CLIENT_ID}:{config.ZOOM_CLIENT_SECRET}".encode()
    ).decode()

    try:
        resp = requests.post(
            "https://zoom.us/oauth/token",
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"grant_type": "account_credentials", "account_id": config.ZOOM_ACCOUNT_ID},
            timeout=10,
        )
    except requests.RequestException as e:
        return None, f"Network error getting Zoom token: {e}"

    if resp.status_code == 200:
        return resp.json().get("access_token"), None
    return None, f"Zoom auth failed ({resp.status_code}): {resp.text}"


def create_zoom_meeting(
    topic: str,
    start_time: str,
    duration_minutes: int = 30,
    agenda: str = "",
) -> tuple[dict | None, str | None]:
    """
    Create a scheduled Zoom meeting.

    start_time: ISO-8601 string, e.g. "2024-01-15T14:00:00"
    Returns (meeting_info_dict, error_string).
    """
    if config.DRY_RUN:
        print(f"[DRY RUN] Zoom meeting → {topic} at {start_time} ({duration_minutes} min)")
        return {
            "join_url": "https://zoom.us/j/dry_run_000",
            "id": "dry_run",
            "topic": topic,
            "start_time": start_time,
            "duration": duration_minutes,
        }, None

    token, err = _get_access_token()
    if err:
        return None, err

    # Normalise start_time to Zoom's expected format (no timezone suffix)
    try:
        dt = datetime.fromisoformat(start_time)
        zoom_time = dt.strftime("%Y-%m-%dT%H:%M:%S")
    except ValueError:
        zoom_time = start_time

    payload = {
        "topic": topic,
        "type": 2,  # scheduled
        "start_time": zoom_time,
        "duration": duration_minutes,
        "timezone": "America/New_York",
        "agenda": agenda,
        "settings": {
            "host_video": True,
            "participant_video": True,
            "join_before_host": False,
            "mute_upon_entry": False,
            "auto_recording": "none",
        },
    }

    host = config.ZOOM_HOST_EMAIL or "me"
    try:
        resp = requests.post(
            f"https://api.zoom.us/v2/users/{host}/meetings",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=payload,
            timeout=15,
        )
    except requests.RequestException as e:
        return None, f"Network error creating Zoom meeting: {e}"

    if resp.status_code == 201:
        data = resp.json()
        return {
            "join_url": data.get("join_url"),
            "id": str(data.get("id")),
            "topic": data.get("topic"),
            "start_time": data.get("start_time"),
            "duration": data.get("duration"),
        }, None

    return None, f"Zoom API error ({resp.status_code}): {resp.text}"
