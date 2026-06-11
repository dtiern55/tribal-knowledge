import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import insert_episode, insert_season


def _locked_episode(conn, season_id, episode_number=1):
    """Episode whose picks_lock_at has already passed."""
    return insert_episode(
        conn,
        season_id,
        episode_number=episode_number,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )


def _upcoming_episode(conn, season_id, episode_number=1):
    """Episode whose picks_lock_at is still in the future."""
    return insert_episode(
        conn,
        season_id,
        episode_number=episode_number,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )


@pytest.mark.integration
def test_score_episode(client, db_conn):
    season = insert_season(db_conn)
    ep = _locked_episode(db_conn, season["id"])
    r = client.post(f"/episodes/{ep['id']}/score")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "scored"
    assert data["id"] == str(ep["id"])


@pytest.mark.integration
def test_score_episode_not_found(client):
    r = client.post(f"/episodes/{uuid.uuid4()}/score")
    assert r.status_code == 404


@pytest.mark.integration
def test_score_episode_already_scored(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        status="scored",
        picks_lock_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    r = client.post(f"/episodes/{ep['id']}/score")
    assert r.status_code == 409


@pytest.mark.integration
def test_score_episode_picks_not_locked(client, db_conn):
    season = insert_season(db_conn)
    ep = _upcoming_episode(db_conn, season["id"])
    r = client.post(f"/episodes/{ep['id']}/score")
    assert r.status_code == 400
    assert "picks are locked" in r.json()["detail"].lower()
