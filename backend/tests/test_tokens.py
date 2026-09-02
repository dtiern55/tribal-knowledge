import pytest
from psycopg2 import errors as pg_errors

from tests.helpers import (
    grant_tokens,
    insert_episode,
    insert_season,
    insert_user,
)


@pytest.mark.integration
def test_balance_starts_at_zero(client, db_conn, current_user):
    season = insert_season(db_conn)
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/tokens/{current_user['id']}"
    )
    assert r.status_code == 200
    data = r.json()
    assert data["balance"] == 0
    assert data["user_id"] == str(current_user["id"])


@pytest.mark.integration
def test_weekly_allocation(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/tokens/weekly-allocation",
        json={"episode_id": str(ep["id"]), "amount": 10},
    )
    assert r.status_code == 200
    rows = r.json()
    assert any(row["user_id"] == str(current_user["id"]) for row in rows)
    assert all(row["transaction_type"] == "weekly_allocation" for row in rows)
    assert all(row["episode_id"] == str(ep["id"]) for row in rows)


@pytest.mark.integration
def test_weekly_allocation_idempotent(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    client.post(
        f"/league-seasons/{season['league_season_id']}/tokens/weekly-allocation",
        json={"episode_id": str(ep["id"]), "amount": 10},
    )
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/tokens/weekly-allocation",
        json={"episode_id": str(ep["id"]), "amount": 10},
    )
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_balance_reflects_allocations(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    grant_tokens(db_conn, current_user["id"], season["id"], amount=10)
    client.post(
        f"/league-seasons/{season['league_season_id']}/tokens/weekly-allocation",
        json={"episode_id": str(ep["id"]), "amount": 10},
    )
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/tokens/{current_user['id']}"
    )
    assert r.json()["balance"] == 20


@pytest.mark.integration
def test_other_users_balance_is_private(client, db_conn):
    season = insert_season(db_conn)
    other = insert_user(db_conn, display_name="Other")
    r = client.get(f"/league-seasons/{season['league_season_id']}/tokens/{other['id']}")
    assert r.status_code == 403


@pytest.mark.integration
def test_token_history_owner_only(client, db_conn, current_user):
    season = insert_season(db_conn)
    other = insert_user(db_conn, display_name="Other")
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/tokens/{other['id']}/history"
    )
    assert r.status_code == 403


@pytest.mark.integration
def test_weekly_grant_unique_index_backstop(db_conn, current_user):
    """#114: the DB itself rejects a duplicate weekly grant, so a race that
    slips past the endpoint's NOT EXISTS guard cannot double-grant."""
    season = insert_season(db_conn)
    episode = insert_episode(db_conn, season["id"], episode_number=2)

    insert_sql = """
        insert into token_transactions
            (user_id, league_season_id, episode_id, transaction_type, amount)
        values (%s, %s, %s, 'weekly_allocation', 10)
    """
    args = [str(current_user["id"]), season["league_season_id"], str(episode["id"])]
    with db_conn.cursor() as cur:
        cur.execute(insert_sql, args)
        with pytest.raises(pg_errors.UniqueViolation):
            cur.execute(insert_sql, args)
