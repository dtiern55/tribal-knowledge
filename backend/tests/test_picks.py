import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_season,
)


def _open_episode(conn, season_id, episode_number=1, max_picks=3):
    return insert_episode(
        conn,
        season_id,
        episode_number=episode_number,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
        max_elimination_picks=max_picks,
    )


@pytest.mark.integration
def test_get_picks_empty(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    r = client.get(f"/episodes/{ep['id']}/picks/{current_user['id']}")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_get_picks_episode_not_found(client):
    r = client.get(f"/episodes/{uuid.uuid4()}/picks/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.integration
def test_submit_picks(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"]), str(c2["id"])]},
    )
    assert r.status_code == 200
    assert len(r.json()) == 2


@pytest.mark.integration
def test_submit_picks_appears_in_get(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    contestant = insert_contestant(db_conn, season["id"])
    client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(contestant["id"])]},
    )
    r = client.get(f"/episodes/{ep['id']}/picks/{current_user['id']}")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["contestant_id"] == str(contestant["id"])


@pytest.mark.integration
def test_submit_picks_replaces_existing(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"])]},
    )
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c2["id"])]},
    )
    assert r.status_code == 200
    picks = client.get(f"/episodes/{ep['id']}/picks/{current_user['id']}").json()
    assert len(picks) == 1
    assert picks[0]["contestant_id"] == str(c2["id"])


@pytest.mark.integration
def test_submit_picks_too_many(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=1)
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"]), str(c2["id"])]},
    )
    assert r.status_code == 400
    assert "Too many picks" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_duplicate_contestant(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=3)
    c = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c["id"]), str(c["id"])]},
    )
    assert r.status_code == 400
    assert "Duplicate" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_scored_episode(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        status="scored",
        picks_lock_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": []},
    )
    assert r.status_code == 400
    assert "scored" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_after_lock_time(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        picks_lock_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": []},
    )
    assert r.status_code == 400
    assert "locked" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_invalid_contestant(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(uuid.uuid4())]},
    )
    assert r.status_code == 400


@pytest.mark.integration
def test_submit_picks_already_eliminated(client, db_conn):
    season = insert_season(db_conn)
    ep1 = insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    ep2 = _open_episode(db_conn, season["id"], episode_number=2)
    contestant = insert_contestant(db_conn, season["id"])
    insert_elimination(db_conn, ep1["id"], contestant["id"])
    r = client.post(
        f"/episodes/{ep2['id']}/picks",
        json={"contestant_ids": [str(contestant["id"])]},
    )
    assert r.status_code == 400
    assert "already eliminated" in r.json()["detail"]


@pytest.mark.integration
def test_submit_empty_picks(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": []},
    )
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_other_users_picks_hidden_until_lock(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    r = client.get(f"/episodes/{ep['id']}/picks/{uuid.uuid4()}")
    assert r.status_code == 403


@pytest.mark.integration
def test_other_users_picks_visible_after_lock(client, db_conn):
    from tests.helpers import insert_elimination_pick, insert_user

    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    contestant = insert_contestant(db_conn, season["id"])
    other = insert_user(db_conn, display_name="Other")
    insert_elimination_pick(db_conn, other["id"], ep["id"], contestant["id"])
    r = client.get(f"/episodes/{ep['id']}/picks/{other['id']}")
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.integration
def test_picks_only_open_for_next_episode(client, db_conn):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"], episode_number=1)
    ep2 = _open_episode(db_conn, season["id"], episode_number=2)
    contestant = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep2['id']}/picks",
        json={"contestant_ids": [str(contestant["id"])]},
    )
    assert r.status_code == 400
    assert "only open for episode 1" in r.json()["detail"]
