import pytest


@pytest.mark.integration
def test_update_display_name(client, current_user):
    r = client.patch("/me", json={"display_name": "  Renamed  "})
    assert r.status_code == 200
    assert r.json()["display_name"] == "Renamed"  # trimmed

    r2 = client.get("/me")
    assert r2.json()["display_name"] == "Renamed"


@pytest.mark.integration
def test_update_blank_display_name_rejected(client, current_user):
    r = client.patch("/me", json={"display_name": ""})
    assert r.status_code == 422


@pytest.mark.integration
def test_update_requires_auth(unauth_client):
    r = unauth_client.patch("/me", json={"display_name": "X"})
    assert r.status_code == 401
