import pytest

from architect_dashboard import app as app_module, config, db


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(config, "GOOGLE_SERVICE_ACCOUNT_FILE", "")
    db.init_db()


def version(client):
    return client.get("/api/version").json()["version"]


def test_changes_bump_the_version_reads_do_not(client):
    start = version(client)
    client.get("/api/dashboard")
    client.post("/api/auth/logout")                      # auth traffic isn't a data change
    client.post("/api/auth/login", json={"email": "ana@studio.example", "password": "correct horse battery"})
    assert version(client) == start

    project = client.post("/api/projects", json={"code": "P-1", "name": "Project"}).json()["id"]
    assert version(client) == start + 1
    phase = client.get(f"/api/projects/{project}").json()["phases"][0]["id"]
    client.patch(f"/api/phases/{phase}", json={"progress": 40})
    assert version(client) == start + 2

    # a rejected change doesn't wake every dashboard
    client.patch(f"/api/phases/{phase}", json={"progress": 400})
    assert version(client) == start + 2


def test_event_stream_announces_the_current_version(client, monkeypatch):
    monkeypatch.setattr(app_module, "EVENT_POLL_SECONDS", 0.01)
    monkeypatch.setattr(app_module, "STREAM_MAX_SECONDS", 0.05)
    current = version(client)
    with client.stream("GET", "/api/events") as res:
        assert res.headers["content-type"].startswith("text/event-stream")
        lines = list(res.iter_lines())
    assert "event: version" in lines and f"data: {current}" in lines


def test_event_stream_needs_sign_in(client):
    client.post("/api/auth/logout")
    assert client.get("/api/events").status_code == 401
