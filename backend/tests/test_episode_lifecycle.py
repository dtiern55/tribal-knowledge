import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import insert_episode, insert_season, insert_user


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


def _weekly_grants(conn, episode_id):
    with conn.cursor() as cur:
        cur.execute(
            """
            select user_id::text as user_id, amount from token_transactions
            where episode_id = %s and transaction_type = 'weekly_allocation'
            """,
            [str(episode_id)],
        )
        return {row["user_id"]: row["amount"] for row in cur.fetchall()}


def _create_episode(client, season_id, episode_number, is_finale=False):
    """Create an episode through the API, which grants its weekly allocation."""
    r = client.post(
        f"/seasons/{season_id}/episodes",
        json={
            "episode_number": episode_number,
            "air_date": "2026-01-01",
            "max_elimination_picks": 3,
            "is_finale": is_finale,
            "picks_lock_at": "2026-01-01T00:00:00+00:00",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.integration
def test_create_episode_grants_weekly_allocation(client, db_conn, current_user):
    """Creating an episode funds it for every player (#217) — including ep1,
    which the old score-driven model never granted (the Cagayan bug)."""
    season = insert_season(db_conn, weekly_token_allocation=7)
    other = insert_user(db_conn, display_name="Other")
    ep1 = _create_episode(client, season["id"], 1)
    grants = _weekly_grants(db_conn, ep1["id"])
    assert grants[str(current_user["id"])] == 7
    assert grants[str(other["id"])] == 7


@pytest.mark.integration
def test_create_finale_grants_nothing(client, db_conn, current_user):
    """The finale is never funded — advantages are locked there (#85/#217)."""
    season = insert_season(db_conn, weekly_token_allocation=7)
    ep = _create_episode(client, season["id"], 6, is_finale=True)
    assert _weekly_grants(db_conn, ep["id"]) == {}


@pytest.mark.integration
def test_advantage_lock_episode_gates_create_grant(client, db_conn, current_user):
    """advantage_lock=5: creating ep4 funds it; creating ep5 does NOT."""
    season = insert_season(db_conn, weekly_token_allocation=7, advantage_lock_episode=5)
    ep4 = _create_episode(client, season["id"], 4)
    ep5 = _create_episode(client, season["id"], 5)
    assert _weekly_grants(db_conn, ep4["id"])[str(current_user["id"])] == 7
    assert _weekly_grants(db_conn, ep5["id"]) == {}


@pytest.mark.integration
def test_create_episode_skips_admin_accounts(client, db_conn, current_user):
    """Service accounts (Producer) don't receive weekly tokens (#50)."""
    season = insert_season(db_conn, weekly_token_allocation=7)
    producer = insert_user(db_conn, display_name="Producer", is_admin=True)
    ep = _create_episode(client, season["id"], 1)
    grants = _weekly_grants(db_conn, ep["id"])
    assert str(current_user["id"]) in grants
    assert str(producer["id"]) not in grants


@pytest.mark.integration
def test_create_grant_not_doubled_by_manual_bootstrap(client, db_conn, current_user):
    """The manual weekly-allocation endpoint is a no-op once create already
    funded the episode — the per-episode unique grant holds."""
    season = insert_season(db_conn, weekly_token_allocation=10)
    ep = _create_episode(client, season["id"], 2)
    r = client.post(
        f"/seasons/{season['id']}/tokens/weekly-allocation",
        json={"episode_id": str(ep["id"]), "amount": 3},
    )
    assert r.status_code == 200
    assert r.json() == []  # already granted at create
    assert _weekly_grants(db_conn, ep["id"])[str(current_user["id"])] == 10


@pytest.mark.integration
def test_create_zero_allocation_grants_nothing(client, db_conn, current_user):
    season = insert_season(db_conn, weekly_token_allocation=0)
    ep = _create_episode(client, season["id"], 1)
    assert _weekly_grants(db_conn, ep["id"]) == {}


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
