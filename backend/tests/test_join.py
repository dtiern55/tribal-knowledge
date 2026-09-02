import pytest

from tests.helpers import insert_league


def _remove_profile(db_conn, user_id):
    with db_conn.cursor() as cur:
        cur.execute("delete from profiles where id = %s", [str(user_id)])


@pytest.mark.integration
def test_join_wrong_code(client, db_conn, current_user):
    _remove_profile(db_conn, current_user["id"])
    insert_league(db_conn, join_code="correct-code")

    r = client.post(
        "/join", json={"display_name": "New Player", "join_code": "wrong-code"}
    )
    assert r.status_code == 400
    assert "Invalid join code" in r.json()["detail"]

    with db_conn.cursor() as cur:
        cur.execute("select 1 from profiles where id = %s", [str(current_user["id"])])
        assert cur.fetchone() is None


@pytest.mark.integration
def test_join_creates_profile_and_membership(client, db_conn, current_user):
    _remove_profile(db_conn, current_user["id"])
    league = insert_league(db_conn, name="Camp", join_code="correct-code")

    r = client.post(
        "/join", json={"display_name": "  New Player  ", "join_code": " correct-code "}
    )
    assert r.status_code == 201
    data = r.json()
    assert data["display_name"] == "New Player"
    assert data["is_admin"] is False
    assert data["leagues"] == [{"id": str(league["id"]), "name": "Camp"}]

    r2 = client.get("/me")
    assert r2.status_code == 200
    assert r2.json()["leagues"] == [{"id": str(league["id"]), "name": "Camp"}]


@pytest.mark.integration
def test_join_second_league_keeps_profile(client, db_conn, current_user):
    """An existing member joins another league with just the code (#595)."""
    first = insert_league(db_conn, name="First", join_code="one")
    second = insert_league(db_conn, name="Second", join_code="two")
    with db_conn.cursor() as cur:
        cur.execute(
            "insert into league_members (league_id, user_id) values (%s, %s)",
            [str(first["id"]), str(current_user["id"])],
        )

    r = client.post("/join", json={"join_code": "two"})
    assert r.status_code == 201
    assert r.json()["display_name"] == current_user["display_name"]
    assert [lg["name"] for lg in r.json()["leagues"]] == ["First", "Second"]

    assert client.post("/join", json={"join_code": "two"}).status_code == 409
    assert str(second["id"]) in {lg["id"] for lg in client.get("/me").json()["leagues"]}


@pytest.mark.integration
def test_join_first_time_requires_display_name(client, db_conn, current_user):
    _remove_profile(db_conn, current_user["id"])
    insert_league(db_conn, join_code="correct-code")
    r = client.post("/join", json={"display_name": "", "join_code": "correct-code"})
    assert r.status_code == 422


@pytest.mark.integration
def test_join_requires_auth(unauth_client):
    r = unauth_client.post("/join", json={"display_name": "X", "join_code": "y"})
    assert r.status_code == 401
