import pytest

from tests.helpers import (
    insert_contestant,
    insert_league,
    insert_roster_pick,
    insert_season,
    insert_user,
    league_season_id,
)


@pytest.mark.integration
def test_create_list_update_league(client):
    r = client.post("/leagues", json={"name": "Camp A", "join_code": "camp-a"})
    assert r.status_code == 201
    league = r.json()
    assert league["member_count"] == 0

    assert (
        client.post("/leagues", json={"name": "Dup", "join_code": "camp-a"}).status_code
        == 409
    )

    r = client.patch(f"/leagues/{league['id']}", json={"join_code": "camp-a-2"})
    assert r.status_code == 200
    assert r.json()["join_code"] == "camp-a-2"

    names = {lg["name"] for lg in client.get("/leagues").json()}
    assert "Camp A" in names


@pytest.mark.integration
def test_list_members(client, db_conn):
    league = insert_league(db_conn, join_code="m")
    member = insert_user(db_conn, display_name="Member")
    with db_conn.cursor() as cur:
        cur.execute(
            "insert into league_members (league_id, user_id) values (%s, %s)",
            [str(league["id"]), str(member["id"])],
        )
    r = client.get(f"/leagues/{league['id']}/members")
    assert r.status_code == 200
    assert [m["display_name"] for m in r.json()] == ["Member"]
    assert client.get(f"/leagues/{league['id']}").status_code in (404, 405)


@pytest.mark.integration
def test_add_and_remove_member(client, db_conn):
    league = insert_league(db_conn, join_code="ar")
    user = insert_user(db_conn, display_name="Newbie")
    with db_conn.cursor() as cur:
        cur.execute("select email from auth.users where id = %s", [str(user["id"])])
        email = cur.fetchone()["email"]
    base = f"/leagues/{league['id']}/members"

    assert client.post(base, json={"email": "nobody@test.com"}).status_code == 404
    r = client.post(base, json={"email": email.upper()})
    assert r.status_code == 201
    assert r.json()["display_name"] == "Newbie"
    assert client.post(base, json={"email": email}).status_code == 409

    assert client.delete(f"{base}/{user['id']}").status_code == 204
    assert client.delete(f"{base}/{user['id']}").status_code == 404
    assert [m["id"] for m in client.get(base).json()] == []


@pytest.mark.integration
def test_remove_member_with_roster_refused(client, db_conn):
    # insert_user enrolls in the default league; a roster there blocks removal.
    season = insert_season(db_conn)
    user = insert_user(db_conn, display_name="Drafted")
    contestant = insert_contestant(db_conn, season["id"])
    insert_roster_pick(db_conn, user["id"], season["id"], contestant["id"])
    with db_conn.cursor() as cur:
        cur.execute(
            "select league_id from league_seasons where id = %s",
            [league_season_id(db_conn, season["id"])],
        )
        league_id = cur.fetchone()["league_id"]
    r = client.delete(f"/leagues/{league_id}/members/{user['id']}")
    assert r.status_code == 409
