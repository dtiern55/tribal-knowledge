import pytest

from tests.helpers import insert_league, insert_user


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
