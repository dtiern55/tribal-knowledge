import pytest


@pytest.mark.integration
def test_update_display_name(client, current_user):
    r = client.patch(
        "/me", json={"display_name": "  Renamed  ", "real_name": " Jane Doe "}
    )
    assert r.status_code == 200
    assert r.json()["display_name"] == "Renamed"  # trimmed
    assert r.json()["real_name"] == "Jane Doe"

    r2 = client.get("/me")
    assert r2.json()["display_name"] == "Renamed"
    assert r2.json()["real_name"] == "Jane Doe"


@pytest.mark.integration
def test_update_blank_display_name_rejected(client, current_user):
    r = client.patch("/me", json={"display_name": "", "real_name": "Jane Doe"})
    assert r.status_code == 422


@pytest.mark.integration
def test_update_requires_auth(unauth_client):
    r = unauth_client.patch("/me", json={"display_name": "X", "real_name": "Y"})
    assert r.status_code == 401
