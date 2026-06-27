import pytest

from tests.helpers import (
    insert_contestant,
    insert_episode,
    insert_roster_pick,
    insert_season,
    insert_user,
)


@pytest.mark.integration
def test_balance_starts_at_zero(client, db_conn, current_user):
    season = insert_season(db_conn)
    r = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}")
    assert r.status_code == 200
    data = r.json()
    assert data["balance"] == 0
    assert data["user_id"] == str(current_user["id"])


@pytest.mark.integration
def test_starting_allocation_all_users(client, db_conn, current_user):
    season = insert_season(db_conn)
    other = insert_user(db_conn, display_name="Other")
    r = client.post(
        f"/seasons/{season['id']}/tokens/starting-allocation",
        json={"amount": 10},
    )
    assert r.status_code == 200
    rows = r.json()
    # Both current_user and other should receive tokens
    user_ids = {row["user_id"] for row in rows}
    assert str(current_user["id"]) in user_ids
    assert str(other["id"]) in user_ids
    assert all(row["amount"] == 10 for row in rows)
    assert all(row["transaction_type"] == "starting_allocation" for row in rows)


@pytest.mark.integration
def test_starting_allocation_single_user(client, db_conn, current_user):
    season = insert_season(db_conn)
    r = client.post(
        f"/seasons/{season['id']}/tokens/starting-allocation",
        json={"amount": 10, "user_id": str(current_user["id"])},
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["user_id"] == str(current_user["id"])


@pytest.mark.integration
def test_starting_allocation_idempotent(client, db_conn, current_user):
    season = insert_season(db_conn)
    client.post(
        f"/seasons/{season['id']}/tokens/starting-allocation", json={"amount": 10}
    )
    # Second call for the same season is idempotent — returns empty list
    r = client.post(
        f"/seasons/{season['id']}/tokens/starting-allocation", json={"amount": 10}
    )
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_starting_allocation_single_user_conflict(client, db_conn, current_user):
    season = insert_season(db_conn)
    client.post(
        f"/seasons/{season['id']}/tokens/starting-allocation",
        json={"amount": 10, "user_id": str(current_user["id"])},
    )
    r = client.post(
        f"/seasons/{season['id']}/tokens/starting-allocation",
        json={"amount": 10, "user_id": str(current_user["id"])},
    )
    assert r.status_code == 409


@pytest.mark.integration
def test_weekly_allocation(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    r = client.post(
        f"/seasons/{season['id']}/tokens/weekly-allocation",
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
        f"/seasons/{season['id']}/tokens/weekly-allocation",
        json={"episode_id": str(ep["id"]), "amount": 10},
    )
    r = client.post(
        f"/seasons/{season['id']}/tokens/weekly-allocation",
        json={"episode_id": str(ep["id"]), "amount": 10},
    )
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_balance_reflects_allocations(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    client.post(
        f"/seasons/{season['id']}/tokens/starting-allocation",
        json={"amount": 10, "user_id": str(current_user["id"])},
    )
    client.post(
        f"/seasons/{season['id']}/tokens/weekly-allocation",
        json={"episode_id": str(ep["id"]), "amount": 10},
    )
    r = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}")
    assert r.json()["balance"] == 20


@pytest.mark.integration
def test_scoring_events_accrue_gameplay_tokens(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=1)
    c = insert_contestant(db_conn, season["id"], "Token Earner")
    # current_user has this contestant on roster for ep 1
    insert_roster_pick(
        db_conn, current_user["id"], season["id"], c["id"], active_from_episode=1
    )

    # steal_immunity_idol earns 20 tokens
    r = client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "steal_immunity_idol"}],
    )
    assert r.status_code == 200

    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()[
        "balance"
    ]
    assert balance == 20


@pytest.mark.integration
def test_scoring_events_no_tokens_for_zero_value_event(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=1)
    c = insert_contestant(db_conn, season["id"])
    insert_roster_pick(
        db_conn, current_user["id"], season["id"], c["id"], active_from_episode=1
    )

    # win_individual_immunity has token_value=0
    client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "win_individual_immunity"}],
    )
    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()[
        "balance"
    ]
    assert balance == 0


@pytest.mark.integration
def test_scoring_events_replace_clears_old_tokens(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=1)
    c = insert_contestant(db_conn, season["id"], "Token Earner")
    insert_roster_pick(
        db_conn, current_user["id"], season["id"], c["id"], active_from_episode=1
    )

    # First post: earns 20 tokens
    client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "steal_immunity_idol"}],
    )
    # Replace with a zero-token event — old tokens should be cleared
    client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "win_individual_immunity"}],
    )
    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()[
        "balance"
    ]
    assert balance == 0
