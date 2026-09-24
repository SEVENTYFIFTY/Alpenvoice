import pytest
from fastapi.testclient import TestClient

from architect_dashboard import auth, config, db

from .conftest import ADMIN, sign_in_as


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(config, "GOOGLE_SERVICE_ACCOUNT_FILE", "")
    monkeypatch.setattr(config, "PUBLIC_BASE_URL", "https://atelier.example")
    auth._failures.clear()
    db.init_db()


@pytest.fixture
def anon():
    from architect_dashboard.app import app
    with TestClient(app, base_url="https://testserver", headers={"X-Atelier": "1"}) as c:
        yield c


def _member(name, email=None):
    with db.connect() as conn:
        return db.upsert_member(conn, name, email=email)


def test_first_run_setup_then_locked(anon):
    me = anon.get("/api/auth/me").json()
    assert me == {"user": None, "setup_needed": True, "office": config.OFFICE_NAME}
    assert anon.post("/api/auth/setup", json={**ADMIN, "password": "short"}).status_code == 422
    assert anon.post("/api/auth/setup", json=ADMIN).status_code == 200
    me = anon.get("/api/auth/me").json()
    assert me["user"]["name"] == "Ana Silva" and me["user"]["access"] == "admin" and not me["setup_needed"]
    # nobody can run setup a second time to make themselves admin
    anon.cookies.clear()
    assert anon.post("/api/auth/setup", json={**ADMIN, "email": "mallory@evil.example"}).status_code == 409


def test_everything_needs_sign_in(anon):
    assert anon.get("/").status_code == 200                      # the sign-in page itself
    assert anon.get("/static/app.js").status_code == 200
    assert anon.get("/api/dashboard").status_code == 401
    assert anon.get("/api/projects/1").status_code == 401
    assert anon.post("/api/projects", json={"code": "X", "name": "Y"}).status_code == 401
    assert anon.get("/docs", follow_redirects=False).status_code == 307
    # Spotlight's page itself loads (built: 200, not built yet: 503 with instructions) and then asks
    # the same protected API for its data
    assert anon.get("/spotlight/").status_code in (200, 503)
    assert anon.get("/api/events").status_code == 401


def test_login_logout_and_wrong_password(client):
    client.post("/api/auth/logout")
    assert client.get("/api/dashboard").status_code == 401
    bad = client.post("/api/auth/login", json={"email": ADMIN["email"], "password": "wrong password!"})
    assert bad.status_code == 401 and bad.json()["detail"] == "Wrong email or password"
    ok = client.post("/api/auth/login", json={"email": ADMIN["email"].upper(), "password": ADMIN["password"]})
    assert ok.status_code == 200
    cookie = ok.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "secure" in cookie
    assert client.get("/api/dashboard").status_code == 200


def test_repeated_failures_are_throttled(client):
    client.post("/api/auth/logout")
    for _ in range(auth.MAX_FAILURES):
        client.post("/api/auth/login", json={"email": ADMIN["email"], "password": "nope nope nope"})
    res = client.post("/api/auth/login", json={"email": ADMIN["email"], "password": ADMIN["password"]})
    assert res.status_code == 401 and "Too many attempts" in res.json()["detail"]


def test_changes_need_the_csrf_header(client):
    res = client.post("/api/projects", json={"code": "X-1", "name": "Forged"}, headers={"X-Atelier": ""})
    assert res.status_code == 403
    assert client.post("/api/projects", json={"code": "X-1", "name": "Real"}).status_code == 201


def test_passwords_never_leave_the_server(client):
    members = client.get("/api/members").json()
    assert members[0]["has_password"] == 1
    assert all("password_hash" not in m for m in members)
    with db.connect() as conn:
        stored = conn.execute("SELECT password_hash FROM members").fetchone()[0]
    assert stored.startswith("scrypt$") and ADMIN["password"] not in stored


def test_roles(client):
    project = client.post("/api/projects", json={"code": "P-1", "name": "Project"}).json()["id"]
    phase = client.get(f"/api/projects/{project}").json()["phases"][0]["id"]
    viewer, member = _member("Vera Viewer"), _member("Tom Team")

    sign_in_as(client, viewer, "viewer")
    assert client.get("/api/dashboard").status_code == 200
    assert client.patch(f"/api/phases/{phase}", json={"progress": 50}).status_code == 403
    assert client.get("/api/export/excel").status_code == 403  # contains contact details

    sign_in_as(client, member, "member")
    assert client.patch(f"/api/phases/{phase}", json={"progress": 50}).status_code == 200
    assert client.get("/api/export/excel").status_code == 200
    for method, path, body in [
        ("DELETE", f"/api/projects/{project}", None),
        ("POST", "/api/members", {"name": "Someone"}),
        ("POST", f"/api/members/{viewer}/invite", None),
        ("PUT", f"/api/members/{viewer}/access", {"access": "admin"}),
        ("POST", "/api/auth/display-links", {"label": "TV"}),
        ("POST", "/api/gdrive/sources", {"link": "1AbCdEfGhIjKlMnOp"}),
    ]:
        assert client.request(method, path, json=body).status_code == 403, path
    # a team member can update their own status, but not someone else's or their own role
    assert client.patch(f"/api/members/{member}", json={"status": "On site"}).status_code == 200
    assert client.patch(f"/api/members/{viewer}", json={"status": "x"}).status_code == 403
    assert client.patch(f"/api/members/{member}", json={"name": "Boss"}).status_code == 403

    # progress is recorded as the signed-in person, whatever the request claims
    client.patch(f"/api/phases/{phase}", json={"progress": 60, "member_id": viewer, "note": "claimed"})
    entry = next(a for a in client.get("/api/dashboard").json()["activity"] if a["note"] == "claimed")
    assert entry["member_name"] == "Tom Team"


def test_removing_access_signs_out_immediately(client):
    member = _member("Tom Team")
    other = TestClient(client.app, base_url="https://testserver", headers={"X-Atelier": "1"})
    sign_in_as(other, member, "member")
    assert other.get("/api/dashboard").status_code == 200
    assert client.put(f"/api/members/{member}/access", json={"access": None}).status_code == 200
    assert other.get("/api/dashboard").status_code == 401


def test_last_principal_cannot_be_demoted(client):
    me = client.get("/api/auth/me").json()["user"]["id"]
    res = client.put(f"/api/members/{me}/access", json={"access": "member"})
    assert res.status_code == 422 and "at least one principal" in res.json()["detail"]


def test_invite_flow(client):
    member = _member("Clara Mendes")
    assert client.post(f"/api/members/{member}/invite").status_code == 422  # needs an email first
    client.patch(f"/api/members/{member}", json={"email": "Clara@Studio.example"})
    link = client.post(f"/api/members/{member}/invite").json()["url"]
    assert link.startswith("https://atelier.example/#invite=")
    token = link.split("#invite=")[1]

    clara = TestClient(client.app, base_url="https://testserver", headers={"X-Atelier": "1"})
    assert clara.get(f"/api/auth/invite/{token}").json() == {"name": "Clara Mendes", "email": "clara@studio.example",
                                                              "reset": False}
    assert clara.post(f"/api/auth/invite/{token}", json={"password": "short"}).status_code == 422
    assert clara.post(f"/api/auth/invite/{token}", json={"password": "a proper password"}).status_code == 200
    assert clara.get("/api/auth/me").json()["user"]["access"] == "member"
    assert clara.get(f"/api/auth/invite/{token}").status_code == 404  # one use only

    # a reset link signs out her other browsers
    token2 = client.post(f"/api/members/{member}/invite").json()["url"].split("#invite=")[1]
    phone = TestClient(client.app, base_url="https://testserver", headers={"X-Atelier": "1"})
    phone.post(f"/api/auth/invite/{token2}", json={"password": "another password"})
    assert clara.get("/api/dashboard").status_code == 401
    assert phone.get("/api/dashboard").status_code == 200


def test_change_password(client):
    wrong = client.post("/api/auth/password", json={"current": "nope", "password": "a brand new password"})
    assert wrong.status_code == 422
    assert client.post("/api/auth/password",
                       json={"current": ADMIN["password"], "password": "a brand new password"}).status_code == 200
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": ADMIN["email"],
                                                "password": "a brand new password"}).status_code == 200


def test_display_link_is_read_only_and_revocable(client):
    url = client.post("/api/auth/display-links", json={"label": "Studio TV"}).json()["url"]
    token = url.rsplit("/", 1)[1]
    tv = TestClient(client.app, base_url="https://testserver", headers={"X-Atelier": "1"})
    res = tv.get(f"/display/{token}", follow_redirects=False)
    assert res.headers["location"] == "/#wall"
    me = tv.get("/api/auth/me").json()["user"]
    assert me["display"] and me["access"] == "viewer" and me["name"] == "Studio TV"
    assert tv.get("/api/dashboard").status_code == 200
    assert tv.post("/api/projects", json={"code": "T", "name": "TV"}).status_code == 403
    assert tv.post("/api/auth/password", json={"current": "", "password": "whatever long"}).status_code == 403

    links = client.get("/api/auth/display-links").json()
    assert links[0]["label"] == "Studio TV" and links[0]["last_used_at"]
    client.delete(f"/api/auth/display-links/{links[0]['id']}")
    assert tv.get("/api/dashboard").status_code == 401
    assert tv.get(f"/display/{token}", follow_redirects=False).headers["location"] == "/?display=invalid"


def test_expired_session_is_rejected(client):
    with db.connect() as conn:
        conn.execute("UPDATE sessions SET expires_at = '2000-01-01T00:00:00'")
    assert client.get("/api/dashboard").status_code == 401


def test_recovery_cli(tmp_path, monkeypatch, capsys):
    import runpy
    import sys
    member = _member("Ana Silva", email="ana@studio.example")
    monkeypatch.setattr(sys, "argv", ["auth", "invite", "ANA@studio.example", "--admin"])
    runpy.run_module("architect_dashboard.auth", run_name="__main__")
    out = capsys.readouterr().out
    assert "https://atelier.example/#invite=" in out
    with db.connect() as conn:
        assert db.get_member(conn, member)["access"] == "admin"
