import os
import uuid

import httpx
import pytest


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
