import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import insert_contestant, insert_episode, insert_season


def _open_finale_episode(conn, season_id):
    return insert_episode(
        conn,
        season_id,
        episode_number=13,
        is_finale=True,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )


def _locked_finale_episode(conn, season_id):
    return insert_episode(
        conn,
        season_id,
        episode_number=13,
        is_finale=True,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )


@pytest.mark.integration
def test_submit_and_get_finale_prediction(client, db_conn, current_user):
    season = insert_season(db_conn, status="active")
    c1 = insert_contestant(db_conn, season["id"], "Player 1")
    c2 = insert_contestant(db_conn, season["id"], "Player 2")
    c3 = insert_contestant(db_conn, season["id"], "Player 3")
    _open_finale_episode(db_conn, season["id"])

    r = client.post(
        f"/seasons/{season['id']}/finale-predictions",
        json={
            "early_boot_contestant_id": str(c1["id"]),
            "fire_loss_contestant_id": str(c2["id"]),
            "winner_contestant_id": str(c3["id"]),
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["early_boot_contestant_id"] == str(c1["id"])
    assert data["fire_loss_contestant_id"] == str(c2["id"])
    assert data["winner_contestant_id"] == str(c3["id"])

    r2 = client.get(f"/seasons/{season['id']}/finale-predictions/{current_user['id']}")
    assert r2.status_code == 200
    assert r2.json()["winner_contestant_id"] == str(c3["id"])


@pytest.mark.integration
def test_partial_ballot_allowed(client, db_conn):
    season = insert_season(db_conn, status="active")
    c1 = insert_contestant(db_conn, season["id"], "Player 1")
    _open_finale_episode(db_conn, season["id"])

    r = client.post(
        f"/seasons/{season['id']}/finale-predictions",
        json={"winner_contestant_id": str(c1["id"])},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["winner_contestant_id"] == str(c1["id"])
    assert data["early_boot_contestant_id"] is None
    assert data["fire_loss_contestant_id"] is None


@pytest.mark.integration
def test_upsert_updates_existing(client, db_conn):
    season = insert_season(db_conn, status="active")
    c1 = insert_contestant(db_conn, season["id"], "Player 1")
    c2 = insert_contestant(db_conn, season["id"], "Player 2")
    _open_finale_episode(db_conn, season["id"])

    client.post(
        f"/seasons/{season['id']}/finale-predictions",
        json={"winner_contestant_id": str(c1["id"])},
    )
    r = client.post(
        f"/seasons/{season['id']}/finale-predictions",
        json={"winner_contestant_id": str(c2["id"])},
    )
    assert r.status_code == 200
    assert r.json()["winner_contestant_id"] == str(c2["id"])


@pytest.mark.integration
def test_get_prediction_not_found(client, db_conn):
    season = insert_season(db_conn)
    r = client.get(f"/seasons/{season['id']}/finale-predictions/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.integration
def test_submit_blocked_no_finale_episode(client, db_conn):
    season = insert_season(db_conn, status="active")
    r = client.post(
        f"/seasons/{season['id']}/finale-predictions",
        json={},
    )
    assert r.status_code == 400
    assert "not yet scheduled" in r.json()["detail"]


@pytest.mark.integration
def test_submit_blocked_after_lock(client, db_conn):
    season = insert_season(db_conn, status="active")
    _locked_finale_episode(db_conn, season["id"])
    r = client.post(
        f"/seasons/{season['id']}/finale-predictions",
        json={},
    )
    assert r.status_code == 400
    assert "window" in r.json()["detail"]


@pytest.mark.integration
def test_submit_blocked_completed_season(client, db_conn):
    season = insert_season(db_conn, status="completed")
    _open_finale_episode(db_conn, season["id"])
    r = client.post(
        f"/seasons/{season['id']}/finale-predictions",
        json={},
    )
    assert r.status_code == 400
    assert "complete" in r.json()["detail"]


@pytest.mark.integration
def test_submit_invalid_contestant(client, db_conn):
    season = insert_season(db_conn, status="active")
    _open_finale_episode(db_conn, season["id"])
    r = client.post(
        f"/seasons/{season['id']}/finale-predictions",
        json={"winner_contestant_id": str(uuid.uuid4())},
    )
    assert r.status_code == 400
    assert "not in this season" in r.json()["detail"]
