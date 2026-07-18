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


@pytest.mark.integration
def test_score_episode_funds_next_episode(client, db_conn, current_user):
    """Scoring episode N funds episode N+1 — tokens for the upcoming ep (#97)."""
    season = insert_season(db_conn, weekly_token_allocation=7)
    other = insert_user(db_conn, display_name="Other")
    ep1 = _locked_episode(db_conn, season["id"], episode_number=1)
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)

    r = client.post(f"/episodes/{ep1['id']}/score")
    assert r.status_code == 200
    assert _weekly_grants(db_conn, ep1["id"]) == {}  # not for the scored episode
    grants = _weekly_grants(db_conn, ep2["id"])
    assert grants[str(current_user["id"])] == 7
    assert grants[str(other["id"])] == 7


@pytest.mark.integration
def test_scoring_does_not_fund_the_finale(client, db_conn, current_user):
    """The finale is never funded — advantages are locked there (#85/#97)."""
    season = insert_season(db_conn, weekly_token_allocation=7)
    ep5 = _locked_episode(db_conn, season["id"], episode_number=5)
    ep6 = insert_episode(db_conn, season["id"], episode_number=6, is_finale=True)
    client.post(f"/episodes/{ep5['id']}/score")
    assert _weekly_grants(db_conn, ep6["id"]) == {}


@pytest.mark.integration
def test_advantage_lock_episode_gates_weekly_tokens(client, db_conn, current_user):
    """advantage_lock=5: scoring ep3 funds ep4; scoring ep4 does NOT fund ep5."""
    season = insert_season(db_conn, weekly_token_allocation=7, advantage_lock_episode=5)
    ep3 = _locked_episode(db_conn, season["id"], episode_number=3)
    ep4 = _locked_episode(db_conn, season["id"], episode_number=4)
    ep5 = insert_episode(db_conn, season["id"], episode_number=5)

    client.post(f"/episodes/{ep3['id']}/score")
    client.post(f"/episodes/{ep4['id']}/score")
    assert _weekly_grants(db_conn, ep4["id"])[str(current_user["id"])] == 7
    assert _weekly_grants(db_conn, ep5["id"]) == {}


@pytest.mark.integration
def test_score_episode_skips_admin_accounts(client, db_conn, current_user):
    """Service accounts (Producer) don't receive weekly tokens (#50)."""
    season = insert_season(db_conn, weekly_token_allocation=7)
    producer = insert_user(db_conn, display_name="Producer", is_admin=True)
    ep1 = _locked_episode(db_conn, season["id"], episode_number=1)
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)

    client.post(f"/episodes/{ep1['id']}/score")
    grants = _weekly_grants(db_conn, ep2["id"])
    assert str(current_user["id"]) in grants
    assert str(producer["id"]) not in grants


@pytest.mark.integration
def test_score_episode_skips_already_granted(client, db_conn, current_user):
    season = insert_season(db_conn, weekly_token_allocation=10)
    ep1 = _locked_episode(db_conn, season["id"], episode_number=1)
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    # ep2 already bootstrapped at season start (weekly-allocation endpoint)
    r = client.post(
        f"/seasons/{season['id']}/tokens/weekly-allocation",
        json={"episode_id": str(ep2["id"]), "amount": 3},
    )
    assert r.status_code == 200

    client.post(f"/episodes/{ep1['id']}/score")  # forward grant would fund ep2
    grants = _weekly_grants(db_conn, ep2["id"])
    assert grants[str(current_user["id"])] == 3  # not doubled by the forward grant


@pytest.mark.integration
def test_score_episode_zero_allocation_grants_nothing(client, db_conn, current_user):
    season = insert_season(db_conn, weekly_token_allocation=0)
    ep1 = _locked_episode(db_conn, season["id"], episode_number=1)
    insert_episode(db_conn, season["id"], episode_number=2)
    client.post(f"/episodes/{ep1['id']}/score")
    assert _weekly_grants(db_conn, ep1["id"]) == {}


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
