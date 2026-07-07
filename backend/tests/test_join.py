import pytest


def _set_code(db_conn, code):
    with db_conn.cursor() as cur:
        cur.execute("update league_settings set join_code = %s", [code])


def _remove_profile(db_conn, user_id):
    with db_conn.cursor() as cur:
        cur.execute("delete from profiles where id = %s", [str(user_id)])


@pytest.mark.integration
def test_join_already_has_profile(client):
    r = client.post("/join", json={"display_name": "X", "join_code": "whatever"})
    assert r.status_code == 409


@pytest.mark.integration
def test_join_wrong_code(client, db_conn, current_user):
    _remove_profile(db_conn, current_user["id"])
    _set_code(db_conn, "correct-code")

    r = client.post(
        "/join", json={"display_name": "New Player", "join_code": "wrong-code"}
    )
    assert r.status_code == 400
    assert "Invalid join code" in r.json()["detail"]

    with db_conn.cursor() as cur:
        cur.execute("select 1 from profiles where id = %s", [str(current_user["id"])])
        assert cur.fetchone() is None


@pytest.mark.integration
def test_join_already_has_profile_wins_over_wrong_code(client, db_conn, current_user):
    # A resubmit with a wrong code from an already-joined user should say
    # "already joined", not confuse them with a code error.
    _set_code(db_conn, "correct-code")
    r = client.post(
        "/join", json={"display_name": "New Player", "join_code": "wrong-code"}
    )
    assert r.status_code == 409


@pytest.mark.integration
def test_join_creates_profile(client, db_conn, current_user):
    _remove_profile(db_conn, current_user["id"])
    _set_code(db_conn, "correct-code")

    r = client.post(
        "/join", json={"display_name": "New Player", "join_code": "correct-code"}
    )
    assert r.status_code == 201
    data = r.json()
    assert data["display_name"] == "New Player"
    assert data["is_admin"] is False

    r2 = client.get("/me")
    assert r2.status_code == 200
    assert r2.json()["display_name"] == "New Player"


@pytest.mark.integration
def test_join_trims_code_and_name(client, db_conn, current_user):
    _remove_profile(db_conn, current_user["id"])
    _set_code(db_conn, "correct-code")

    r = client.post(
        "/join",
        json={"display_name": "  New Player  ", "join_code": "  correct-code  "},
    )
    assert r.status_code == 201
    assert r.json()["display_name"] == "New Player"


@pytest.mark.integration
def test_join_blank_display_name_rejected(client, db_conn, current_user):
    _remove_profile(db_conn, current_user["id"])
    r = client.post("/join", json={"display_name": "", "join_code": "change-me"})
    assert r.status_code == 422


@pytest.mark.integration
def test_join_requires_auth(unauth_client):
    r = unauth_client.post("/join", json={"display_name": "X", "join_code": "y"})
    assert r.status_code == 401
