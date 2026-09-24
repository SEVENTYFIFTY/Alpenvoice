import base64
import time
from email import message_from_bytes, policy
from urllib.parse import parse_qs, urlparse

import pytest

from architect_dashboard import config, db, gmail

from .conftest import sign_in_as

ME = "luca@studio.example"
CLIENT = "joana@costa.example"
ENGINEER = "rita@lopes-eng.example"


def _msg(sender, to, subject, when, message_id, labels=("INBOX",)):
    return {
        "labelIds": list(labels),
        "internalDate": str(int(when * 1000)),
        "payload": {"headers": [
            {"name": "From", "value": sender}, {"name": "To", "value": to},
            {"name": "Subject", "value": subject}, {"name": "Message-ID", "value": message_id},
        ]},
    }


class FakeResponse:
    def __init__(self, status=200, body=None):
        self.status_code, self._body = status, body or {}

    def json(self):
        return self._body


class FakeGoogle:
    """Just enough of Google OAuth + the Gmail API."""

    def __init__(self):
        now = time.time()
        self.threads = {
            "t1": {"id": "t1", "messages": [
                _msg(f"Luca <{ME}>", CLIENT, "HH-014 Kitchen window heights", now - 3 * 86400, "<a1@x>"),
                _msg(f"Joana Costa <{CLIENT}>", ME, "Re: HH-014 Kitchen window heights", now - 2 * 86400, "<a2@x>"),
            ]},
            "t2": {"id": "t2", "messages": [
                _msg(f"Rita Lopes <{ENGINEER}>", ME, "Beam over living, revised", now - 86400, "<b1@x>"),
                _msg(f"Luca <{ME}>", ENGINEER, "Re: Beam over living, revised", now - 3600, "<b2@x>"),
                _msg(f"Luca <{ME}>", ENGINEER, "Re: Beam", now, "<draft@x>", labels=("DRAFT",)),
            ]},
            "t3": {"id": "t3", "messages": [
                _msg("Newsletter <news@shop.example>", ME, "Sale!", now, "<c1@x>"),
            ]},
        }
        self.queries, self.drafts, self.revoked, self.refreshes = [], [], [], 0

    def post(self, url, data=None, params=None, timeout=None):
        if url == gmail.TOKEN_URL:
            if data["grant_type"] == "authorization_code":
                assert data["code"] == "good-code"
                return FakeResponse(body={"access_token": "at-1", "refresh_token": "rt-1", "expires_in": 3600})
            assert data["refresh_token"] == "rt-1"
            self.refreshes += 1
            return FakeResponse(body={"access_token": f"at-{self.refreshes + 1}", "expires_in": 3600})
        if url == gmail.REVOKE_URL:
            self.revoked.append(params["token"])
            return FakeResponse()
        raise AssertionError(url)

    def request(self, method, url, headers=None, params=None, json=None, timeout=None):
        assert headers["Authorization"].startswith("Bearer at-")
        path = url[len(gmail.API):]
        if path == "/profile":
            return FakeResponse(body={"emailAddress": ME})
        if path == "/threads":
            self.queries.append(params["q"])
            return FakeResponse(body={"threads": [{"id": t} for t in self.threads]})
        if path.startswith("/threads/"):
            return FakeResponse(body=self.threads[path.split("/")[-1]])
        if path == "/drafts" and method == "POST":
            self.drafts.append(message_from_bytes(base64.urlsafe_b64decode(json["message"]["raw"]), policy=policy.default))
            return FakeResponse(body={"id": "d1", "message": {"id": "m123"}})
        raise AssertionError(path)


@pytest.fixture(autouse=True)
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(config, "GOOGLE_SERVICE_ACCOUNT_FILE", "")
    monkeypatch.setattr(config, "GOOGLE_OAUTH_CLIENT_ID", "client-id")
    monkeypatch.setattr(config, "GOOGLE_OAUTH_CLIENT_SECRET", "client-secret")
    monkeypatch.setattr(config, "STUDIO_SECRET_KEY", "test-secret")
    monkeypatch.setattr(config, "GMAIL_SYNC_MINUTES", 0)
    monkeypatch.setattr(config, "PUBLIC_BASE_URL", "https://atelier.example")
    db.init_db()


@pytest.fixture
def google(monkeypatch):
    fake = FakeGoogle()
    monkeypatch.setattr(gmail, "http", fake)
    return fake


def _office():
    with db.connect() as conn:
        luca = db.upsert_member(conn, "Luca Moretti", email=ME)
        hh = db.create_project(conn, {"code": "HH-014", "name": "Harbor House"}, template="atelier")
        lx = db.create_project(conn, {"code": "LX-019", "name": "Lx Courtyard"}, template="atelier")
        db.upsert_contact(conn, hh, {"name": "Joana Costa", "email": CLIENT, "kind": "client", "notify": True})
        db.upsert_contact(conn, hh, {"name": "Rita Lopes", "email": ENGINEER, "kind": "consultant"})
        db.upsert_contact(conn, lx, {"name": "Rita Lopes", "email": ENGINEER.upper(), "kind": "consultant"})
    return luca, hh, lx


def _connect(client, luca):
    sign_in_as(client, luca)
    res = client.get("/api/gmail/connect", follow_redirects=False)
    state = parse_qs(urlparse(res.headers["location"]).query)["state"][0]
    return client.get(f"/api/gmail/callback?code=good-code&state={state}", follow_redirects=False)


def test_state_is_signed_and_expires(monkeypatch):
    state = gmail.make_state(7)
    assert gmail.read_state(state) == 7
    member, issued, nonce, sig = state.split(".")
    with pytest.raises(gmail.GmailError):
        gmail.read_state(f"8.{issued}.{nonce}.{sig}")  # tampered member id
    monkeypatch.setattr(gmail.time, "time", lambda: int(issued) + gmail.STATE_MAX_AGE + 1)
    with pytest.raises(gmail.GmailError):
        gmail.read_state(state)


def test_connect_flow_stores_encrypted_tokens_and_syncs(client, google):
    luca, hh, lx = _office()
    sign_in_as(client, luca)
    start = client.get("/api/gmail/connect", follow_redirects=False)
    params = parse_qs(urlparse(start.headers["location"]).query)
    assert params["redirect_uri"] == ["https://atelier.example/api/gmail/callback"]
    assert params["access_type"] == ["offline"] and params["login_hint"] == [ME]
    assert "gmail.compose" in params["scope"][0]

    res = _connect(client, luca)
    assert res.headers["location"] == "/?gmail=connected#data"
    with db.connect() as conn:
        account = db.get_gmail_account(conn, luca)
        threads = db.mail_threads(conn)
    assert account["email"] == ME
    assert "rt-1" not in account["refresh_token"] and gmail.decrypt(account["refresh_token"]) == "rt-1"
    assert "from:joana@costa.example" in google.queries[0] and "newer_than:30d" in google.queries[0]

    by_thread = {t["thread_id"]: t for t in threads}
    assert set(by_thread) == {"t1", "t2"}  # the newsletter isn't a project thread
    assert by_thread["t1"]["project_id"] == hh and by_thread["t1"]["awaiting_reply"] == 1
    assert by_thread["t1"]["from_name"] == "Joana Costa"
    assert by_thread["t2"]["awaiting_reply"] == 0  # Luca replied last (the draft doesn't count)
    assert by_thread["t2"]["message_count"] == 2


def test_bad_state_is_rejected(client, google):
    _office()
    res = client.get("/api/gmail/callback?code=good-code&state=1.2.3.bad", follow_redirects=False)
    assert "gmail_error=" in res.headers["location"]
    assert client.get("/api/gmail/callback?error=access_denied", follow_redirects=False).headers["location"] == \
        "/?gmail=cancelled#data"


def test_dashboard_shows_waiting_mail(client, google):
    luca, hh, lx = _office()
    _connect(client, luca)
    dash = client.get("/api/dashboard").json()
    assert [m["subject"] for m in dash["mail"]] == ["HH-014 Kitchen window heights"]  # thread subject
    assert dash["mail"][0]["url"] == "https://mail.google.com/mail/u/luca%40studio.example/#all/t1"
    projects = {p["code"]: p for p in dash["projects"]}
    assert projects["HH-014"]["mail_waiting"] == 1 and projects["HH-014"]["needs_attention"]
    assert projects["LX-019"]["mail_waiting"] == 0
    assert dash["kpis"]["mail_waiting"] == 1
    detail = client.get(f"/api/projects/{hh}").json()
    assert len(detail["mail"]) == 2


def test_same_thread_in_two_mailboxes_is_listed_once(client, google):
    luca, hh, lx = _office()
    _connect(client, luca)
    with db.connect() as conn:
        ana = db.upsert_member(conn, "Ana Silva")
        conn.execute("INSERT INTO gmail_accounts (member_id, email, refresh_token, connected_at) VALUES (?, ?, ?, ?)",
                     (ana, "ana@studio.example", gmail.encrypt("rt-ana"), db.now()))
        thread = dict(db.mail_threads(conn, awaiting_only=True)[0])
        db.replace_mail_threads(conn, ana, [{**thread, "thread_id": "other-id"}])
        assert len(db.mail_threads(conn, awaiting_only=True)) == 1


def test_expired_token_is_refreshed(client, google):
    luca, *_ = _office()
    _connect(client, luca)
    with db.connect() as conn:
        conn.execute("UPDATE gmail_accounts SET token_expires_at = 0")
    assert gmail.sync_account(luca).startswith("OK")
    assert google.refreshes == 1
    with db.connect() as conn:
        assert gmail.decrypt(db.get_gmail_account(conn, luca)["access_token"]) == "at-2"


def test_board_move_saves_gmail_draft(client, google):
    luca, hh, lx = _office()
    _connect(client, luca)
    res = client.post(f"/api/projects/{hh}/move",
                      json={"phase_name": "Design development", "member_id": luca, "create_draft": True}).json()
    draft = res["email"]["gmail_draft"]
    assert draft["url"] == "https://mail.google.com/mail/u/luca%40studio.example/#drafts?compose=m123"
    sent = google.drafts[0]
    assert sent["To"] == f"Joana Costa <{CLIENT}>" and sent["From"] == ME
    assert sent["Subject"] == "HH-014 Harbor House: now in Design development"
    assert "Dear Joana," in sent.get_content()

    # without create_draft, nothing is written to Gmail
    client.post(f"/api/projects/{hh}/move", json={"phase_name": "Permitting", "member_id": luca})
    assert len(google.drafts) == 1


def test_draft_failure_does_not_undo_the_move(client, google):
    luca, hh, lx = _office()  # Gmail never connected
    sign_in_as(client, luca)
    res = client.post(f"/api/projects/{hh}/move",
                      json={"phase_name": "Concept", "member_id": luca, "create_draft": True}).json()
    assert "not connected" in res["email"]["draft_error"]
    assert client.get(f"/api/projects/{hh}").json()["current_phase"] == "Concept"


def test_disconnect_revokes_and_removes_threads(client, google):
    luca, *_ = _office()
    _connect(client, luca)
    assert client.delete(f"/api/gmail/accounts/{luca}").status_code == 200
    assert google.revoked == ["rt-1"]
    with db.connect() as conn:
        assert db.list_gmail_accounts(conn) == [] and db.mail_threads(conn) == []


def test_status_reports_missing_settings(client, monkeypatch):
    monkeypatch.setattr(config, "STUDIO_SECRET_KEY", "")
    status = client.get("/api/gmail/status").json()
    assert status["configured"] is False and status["missing"] == ["STUDIO_SECRET_KEY"]
    assert client.post("/api/gmail/sync").status_code == 400
