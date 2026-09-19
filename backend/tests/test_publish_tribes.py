import pytest

from tests.helpers import insert_contestant, insert_season


def _cast_tribes(client, season_id) -> dict[str, str | None]:
    return {
        c["name"]: c["tribe_name"]
        for c in client.get(f"/seasons/{season_id}/cast").json()
    }


@pytest.mark.integration
def test_publish_tribes_is_live_and_republish_replaces(client, db_conn):
    season = insert_season(db_conn)
    a = insert_contestant(db_conn, season["id"], name="Ann")
    b = insert_contestant(db_conn, season["id"], name="Bo")
    url = f"/seasons/{season['id']}/tribes"

    body = {
        "from_episode": 1,
        "tribes": [
            {"name": "Luvu", "color": "#1f6fb2", "contestant_ids": [str(a["id"])]},
            {"name": "Gata", "color": "#e0b020", "contestant_ids": [str(b["id"])]},
        ],
    }
    assert client.put(url, json=body).status_code == 200
    assert _cast_tribes(client, season["id"]) == {"Ann": "Luvu", "Bo": "Gata"}

    # Rename + move: the old tribe is dropped, not left empty.
    body["tribes"] = [
        {
            "name": "Yase",
            "color": "#2a9d4b",
            "contestant_ids": [str(a["id"]), str(b["id"])],
        }
    ]
    assert client.put(url, json=body).status_code == 200
    assert _cast_tribes(client, season["id"]) == {"Ann": "Yase", "Bo": "Yase"}
    with db_conn.cursor() as cur:
        cur.execute("select name from tribes where season_id = %s", [str(season["id"])])
        assert [r["name"] for r in cur.fetchall()] == ["Yase"]


@pytest.mark.integration
def test_publish_tribes_rejects_contestant_in_two_tribes(client, db_conn):
    season = insert_season(db_conn)
    a = insert_contestant(db_conn, season["id"], name="Ann")
    body = {
        "from_episode": 1,
        "tribes": [
            {"name": "Luvu", "color": "#1f6fb2", "contestant_ids": [str(a["id"])]},
            {"name": "Gata", "color": "#e0b020", "contestant_ids": [str(a["id"])]},
        ],
    }
    assert client.put(f"/seasons/{season['id']}/tribes", json=body).status_code == 400
