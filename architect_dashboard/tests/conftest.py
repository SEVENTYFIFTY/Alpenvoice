import pytest
from fastapi.testclient import TestClient

from architect_dashboard import auth, db

ADMIN = {"name": "Ana Silva", "email": "ana@studio.example", "password": "correct horse battery"}


def sign_in_as(client, member_id: int, access: str = "member", password: str = "a long enough password"):
    """Give an existing team member a login and switch the client's session to them."""
    with db.connect() as conn:
        member = db.get_member(conn, member_id)
        email = member["email"] or f"member{member_id}@studio.example"
        conn.execute("UPDATE members SET email = ?, access = ?, password_hash = ? WHERE id = ?",
                     (email, access, auth.hash_password(password), member_id))
    client.cookies.clear()
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return client


@pytest.fixture
def client():
    from architect_dashboard.app import app
    # https so the Secure session cookie is sent back, as in production behind TLS
    with TestClient(app, base_url="https://testserver", headers={"X-Atelier": "1"}) as c:
        assert c.post("/api/auth/setup", json=ADMIN).status_code == 200
        yield c
