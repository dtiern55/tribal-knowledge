import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_contestant,
    insert_episode,
    insert_season,
    insert_winner_pick,
)


def _open_merge_episode(conn, season_id, merge_episode_number=9):
    return insert_episode(
        conn,
        season_id,
        episode_number=merge_episode_number,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )


def _locked_merge_episode(conn, season_id, merge_episode_number=9):
    return insert_episode(
        conn,
        season_id,
        episode_number=merge_episode_number,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )


def _active_season_with_merge(conn, merge_episode=9):
    return insert_season(conn, status="active", merge_episode=merge_episode)


@pytest.mark.integration
def test_submit_and_get_winner_pick(client, db_conn, current_user):
    season = _active_season_with_merge(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    c2 = insert_contestant(db_conn, season["id"], "Bob")
    _open_merge_episode(db_conn, season["id"])

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={
            "winner_contestant_id": str(c1["id"]),
            "backup_contestant_id": str(c2["id"]),
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["winner_contestant_id"] == str(c1["id"])
    assert data["backup_contestant_id"] == str(c2["id"])
    assert data["effective_episode"] == 1

    r2 = client.get(f"/seasons/{season['id']}/winner-picks/{current_user['id']}")
    assert r2.status_code == 200
    assert r2.json()["winner_contestant_id"] == str(c1["id"])


@pytest.mark.integration
def test_get_not_found(client, db_conn):
    season = insert_season(db_conn)
    r = client.get(f"/seasons/{season['id']}/winner-picks/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.integration
def test_get_returns_most_recent_when_multiple_rows(client, db_conn, current_user):
    season = _active_season_with_merge(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    c2 = insert_contestant(db_conn, season["id"], "Bob")
    c3 = insert_contestant(db_conn, season["id"], "Carol")
    uid = current_user["id"]
    sid = season["id"]
    insert_winner_pick(db_conn, uid, sid, c1["id"], c2["id"], effective_episode=1)
    insert_winner_pick(db_conn, uid, sid, c3["id"], c2["id"], effective_episode=5)

    r = client.get(f"/seasons/{season['id']}/winner-picks/{current_user['id']}")
    assert r.status_code == 200
    assert r.json()["winner_contestant_id"] == str(c3["id"])
    assert r.json()["effective_episode"] == 5


@pytest.mark.integration
def test_submit_duplicate_rejected(client, db_conn, current_user):
    season = _active_season_with_merge(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    c2 = insert_contestant(db_conn, season["id"], "Bob")
    _open_merge_episode(db_conn, season["id"])
    insert_winner_pick(db_conn, current_user["id"], season["id"], c1["id"], c2["id"])

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={
            "winner_contestant_id": str(c1["id"]),
            "backup_contestant_id": str(c2["id"]),
        },
    )
    assert r.status_code == 409
    assert "tokens" in r.json()["detail"]


@pytest.mark.integration
def test_submit_same_winner_and_backup_rejected(client, db_conn):
    season = _active_season_with_merge(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    _open_merge_episode(db_conn, season["id"])

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={
            "winner_contestant_id": str(c1["id"]),
            "backup_contestant_id": str(c1["id"]),
        },
    )
    assert r.status_code == 400
    assert "different" in r.json()["detail"]


@pytest.mark.integration
def test_submit_invalid_contestant_rejected(client, db_conn):
    season = _active_season_with_merge(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    _open_merge_episode(db_conn, season["id"])

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={
            "winner_contestant_id": str(c1["id"]),
            "backup_contestant_id": str(uuid.uuid4()),
        },
    )
    assert r.status_code == 400
    assert "not in this season" in r.json()["detail"]


@pytest.mark.integration
def test_submit_blocked_after_merge_lock(client, db_conn):
    season = _active_season_with_merge(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    c2 = insert_contestant(db_conn, season["id"], "Bob")
    _locked_merge_episode(db_conn, season["id"])

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={
            "winner_contestant_id": str(c1["id"]),
            "backup_contestant_id": str(c2["id"]),
        },
    )
    assert r.status_code == 400
    assert "window" in r.json()["detail"]


@pytest.mark.integration
def test_submit_blocked_no_merge_episode(client, db_conn):
    season = _active_season_with_merge(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    c2 = insert_contestant(db_conn, season["id"], "Bob")
    # No episode inserted

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={
            "winner_contestant_id": str(c1["id"]),
            "backup_contestant_id": str(c2["id"]),
        },
    )
    assert r.status_code == 400
    assert "not yet scheduled" in r.json()["detail"]


@pytest.mark.integration
def test_submit_blocked_no_merge_episode_configured(client, db_conn):
    season = insert_season(db_conn, status="active")  # no merge_episode
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    c2 = insert_contestant(db_conn, season["id"], "Bob")

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={
            "winner_contestant_id": str(c1["id"]),
            "backup_contestant_id": str(c2["id"]),
        },
    )
    assert r.status_code == 400
    assert "Merge episode not set" in r.json()["detail"]


@pytest.mark.integration
def test_submit_blocked_completed_season(client, db_conn):
    season = _active_season_with_merge(db_conn)
    c1 = insert_contestant(db_conn, season["id"], "Alice")
    c2 = insert_contestant(db_conn, season["id"], "Bob")
    _open_merge_episode(db_conn, season["id"])
    # Patch season to completed
    with db_conn.cursor() as cur:
        cur.execute(
            "update seasons set status = 'completed' where id = %s",
            [str(season["id"])],
        )

    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={
            "winner_contestant_id": str(c1["id"]),
            "backup_contestant_id": str(c2["id"]),
        },
    )
    assert r.status_code == 400
    assert "complete" in r.json()["detail"]
