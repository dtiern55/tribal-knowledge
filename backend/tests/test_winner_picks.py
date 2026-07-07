import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_contestant,
    insert_episode,
    insert_season,
    insert_winner_pick,
)


def _open_lock_episode(conn, season_id, lock_episode_number=3):
    return insert_episode(
        conn,
        season_id,
        episode_number=lock_episode_number,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )


def _locked_lock_episode(conn, season_id, lock_episode_number=3):
    return insert_episode(
        conn,
        season_id,
        episode_number=lock_episode_number,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )


def _active_season_with_lock(conn, winner_lock_episode=3):
    return insert_season(conn, status="active", winner_lock_episode=winner_lock_episode)


@pytest.mark.integration
def test_submit_and_get_winner_pick(client, db_conn, current_user):
    season = _active_season_with_lock(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    _open_lock_episode(db_conn, season["id"])

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={"winner_contestant_id": str(c1["id"])},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["winner_contestant_id"] == str(c1["id"])
    assert data["effective_episode"] == 1
    assert "backup_contestant_id" not in data

    r2 = client.get(f"/seasons/{season['id']}/winner-picks/{current_user['id']}")
    assert r2.status_code == 200
    assert r2.json()["winner_contestant_id"] == str(c1["id"])


@pytest.mark.integration
def test_resubmit_overwrites_pick(client, db_conn, current_user):
    season = _active_season_with_lock(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    c2 = insert_contestant(db_conn, season["id"], "Bob")
    _open_lock_episode(db_conn, season["id"])

    client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={"winner_contestant_id": str(c1["id"])},
    )
    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={"winner_contestant_id": str(c2["id"])},
    )
    assert r.status_code == 200
    assert r.json()["winner_contestant_id"] == str(c2["id"])

    r2 = client.get(f"/seasons/{season['id']}/winner-picks/{current_user['id']}")
    assert r2.json()["winner_contestant_id"] == str(c2["id"])


@pytest.mark.integration
def test_get_not_found(client, db_conn, current_user):
    season = insert_season(db_conn)
    r = client.get(f"/seasons/{season['id']}/winner-picks/{current_user['id']}")
    assert r.status_code == 404


@pytest.mark.integration
def test_other_users_pick_hidden_until_lock(client, db_conn):
    season = insert_season(db_conn, winner_lock_episode=3)
    _open_lock_episode(db_conn, season["id"])
    r = client.get(f"/seasons/{season['id']}/winner-picks/{uuid.uuid4()}")
    assert r.status_code == 403


@pytest.mark.integration
def test_other_users_pick_visible_after_lock(client, db_conn):
    from tests.helpers import insert_user

    season = insert_season(db_conn, winner_lock_episode=3)
    insert_episode(
        db_conn,
        season["id"],
        episode_number=3,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    other = insert_user(db_conn, display_name="Other")
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    insert_winner_pick(db_conn, other["id"], season["id"], c1["id"])
    r = client.get(f"/seasons/{season['id']}/winner-picks/{other['id']}")
    assert r.status_code == 200
    assert r.json()["user_id"] == str(other["id"])


@pytest.mark.integration
def test_submit_invalid_contestant_rejected(client, db_conn):
    season = _active_season_with_lock(db_conn)
    insert_contestant(db_conn, season["id"], "Alice")
    _open_lock_episode(db_conn, season["id"])

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={"winner_contestant_id": str(uuid.uuid4())},
    )
    assert r.status_code == 400
    assert "not in this season" in r.json()["detail"]


@pytest.mark.integration
def test_submit_blocked_after_lock(client, db_conn):
    season = _active_season_with_lock(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    _locked_lock_episode(db_conn, season["id"])

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={"winner_contestant_id": str(c1["id"])},
    )
    assert r.status_code == 400
    assert "window" in r.json()["detail"]


@pytest.mark.integration
def test_submit_allowed_when_lock_episode_not_yet_scheduled(client, db_conn):
    # Matches roster/#40: open until the lock episode exists and locks.
    season = _active_season_with_lock(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    # No episode inserted for winner_lock_episode

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={"winner_contestant_id": str(c1["id"])},
    )
    assert r.status_code == 200


@pytest.mark.integration
def test_submit_blocked_no_winner_lock_episode_configured(client, db_conn):
    season = insert_season(db_conn, status="active")  # no winner_lock_episode
    c1 = insert_contestant(db_conn, season["id"], "Alice")

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={"winner_contestant_id": str(c1["id"])},
    )
    assert r.status_code == 400
    assert "Winner lock episode not set" in r.json()["detail"]


@pytest.mark.integration
def test_submit_blocked_completed_season(client, db_conn):
    season = _active_season_with_lock(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    _open_lock_episode(db_conn, season["id"])
    with db_conn.cursor() as cur:
        cur.execute(
            "update seasons set status = 'completed' where id = %s",
            [str(season["id"])],
        )

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={"winner_contestant_id": str(c1["id"])},
    )
    assert r.status_code == 400
    assert "complete" in r.json()["detail"]
