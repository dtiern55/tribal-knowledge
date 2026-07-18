import os
import uuid
from contextlib import contextmanager

import httpx
import pytest
from fastapi.testclient import TestClient

import app.database as database_module
from app.auth import get_current_user
from app.main import app
from tests.helpers import insert_user


@pytest.mark.integration
def test_real_supabase_token_is_accepted(unauth_client):
    """A genuine ES256 token from Supabase Auth must pass get_current_user.

    Regression test for #43: every prior test used a self-forged HS256
    token, which only proved the check logic worked, never that it
    accepted a token Supabase actually issues. This signs up a real user
    against the local Supabase Auth REST API and uses the real
    access_token it returns.
    """
    email = f"{uuid.uuid4()}@test.com"
    resp = httpx.post(
        f"{os.environ['SUPABASE_URL']}/auth/v1/signup",
        headers={"apikey": os.environ["SUPABASE_ANON_KEY"]},
        json={"email": email, "password": "correct-horse-battery-staple"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]

    r = unauth_client.get("/me", headers={"Authorization": f"Bearer {token}"})
    # No profile exists for this brand-new auth user -- 404 proves the
    # token was decoded and its sub extracted, i.e. auth succeeded, rather
    # than 401ing on the token itself.
    assert r.status_code == 404
    assert r.json()["detail"] == "Profile not found"


@pytest.mark.integration
def test_admin_routes_enforce_is_admin(monkeypatch, db_conn):
    """The real get_current_admin gates on profiles.is_admin (#111).

    The shared `client` fixture overrides get_current_admin away, so no
    other test exercises it: a dropped or inverted is_admin check would
    leave the whole suite green. Here only get_current_user is stubbed;
    the admin check runs for real against the test DB.
    """

    @contextmanager
    def _get_db():
        yield db_conn

    monkeypatch.setattr(database_module, "get_db", _get_db)

    player = insert_user(db_conn, display_name="Regular Player")
    admin = insert_user(db_conn, display_name="Admin", is_admin=True)
    current = {"id": player["id"]}
    app.dependency_overrides[get_current_user] = lambda: current["id"]
    body = {"name": "Survivor: Admin Gate", "season_number": 4242}
    try:
        with TestClient(app) as c:
            r = c.post("/seasons", json=body)
            assert r.status_code == 403
            assert r.json()["detail"] == "Admin access required"

            current["id"] = admin["id"]
            r = c.post("/seasons", json=body)
            assert r.status_code == 201
    finally:
        app.dependency_overrides.clear()
