import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_season,
    insert_user,
)


def _open_episode(conn, season_id, episode_number=1, max_picks=3):
    return insert_episode(
        conn,
        season_id,
        episode_number=episode_number,
        status="picks_open",
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
        max_elimination_picks=max_picks,
    )


@pytest.mark.integration
def test_get_picks_empty(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    user = insert_user(db_conn)
    r = client.get(f"/episodes/{ep['id']}/picks/{user['id']}")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_get_picks_episode_not_found(client):
    r = client.get(f"/episodes/{uuid.uuid4()}/picks/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.integration
def test_submit_picks(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    user = insert_user(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [str(c1["id"]), str(c2["id"])],
        },
    )
    assert r.status_code == 200
    assert len(r.json()) == 2


@pytest.mark.integration
def test_submit_picks_appears_in_get(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    user = insert_user(db_conn)
    contestant = insert_contestant(db_conn, season["id"])
    client.post(
        f"/episodes/{ep['id']}/picks",
        json={"user_id": str(user["id"]), "contestant_ids": [str(contestant["id"])]},
    )
    r = client.get(f"/episodes/{ep['id']}/picks/{user['id']}")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["contestant_id"] == str(contestant["id"])


@pytest.mark.integration
def test_submit_picks_replaces_existing(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    user = insert_user(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    client.post(
        f"/episodes/{ep['id']}/picks",
        json={"user_id": str(user["id"]), "contestant_ids": [str(c1["id"])]},
    )
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"user_id": str(user["id"]), "contestant_ids": [str(c2["id"])]},
    )
    assert r.status_code == 200
    picks = client.get(f"/episodes/{ep['id']}/picks/{user['id']}").json()
    assert len(picks) == 1
    assert picks[0]["contestant_id"] == str(c2["id"])


@pytest.mark.integration
def test_submit_picks_too_many(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=1)
    user = insert_user(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [str(c1["id"]), str(c2["id"])],
        },
    )
    assert r.status_code == 400
    assert "Too many picks" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_duplicate_contestant(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=3)
    user = insert_user(db_conn)
    c = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [str(c["id"]), str(c["id"])],
        },
    )
    assert r.status_code == 400
    assert "Duplicate" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_not_open(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"], status="picks_locked")
    user = insert_user(db_conn)
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"user_id": str(user["id"]), "contestant_ids": []},
    )
    assert r.status_code == 400
    assert "not open" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_after_lock_time(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        status="picks_open",
        picks_lock_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    user = insert_user(db_conn)
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"user_id": str(user["id"]), "contestant_ids": []},
    )
    assert r.status_code == 400
    assert "locked" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_invalid_contestant(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    user = insert_user(db_conn)
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"user_id": str(user["id"]), "contestant_ids": [str(uuid.uuid4())]},
    )
    assert r.status_code == 400


@pytest.mark.integration
def test_submit_picks_already_eliminated(client, db_conn):
    season = insert_season(db_conn)
    ep1 = insert_episode(db_conn, season["id"], episode_number=1)
    ep2 = _open_episode(db_conn, season["id"], episode_number=2)
    user = insert_user(db_conn)
    contestant = insert_contestant(db_conn, season["id"])
    insert_elimination(db_conn, ep1["id"], contestant["id"])
    r = client.post(
        f"/episodes/{ep2['id']}/picks",
        json={"user_id": str(user["id"]), "contestant_ids": [str(contestant["id"])]},
    )
    assert r.status_code == 400
    assert "already eliminated" in r.json()["detail"]


@pytest.mark.integration
def test_submit_empty_picks(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    user = insert_user(db_conn)
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"user_id": str(user["id"]), "contestant_ids": []},
    )
    assert r.status_code == 200
    assert r.json() == []
