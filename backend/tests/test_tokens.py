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
def test_scoring_events_grant_no_tokens_past_cutoff(client, db_conn, current_user):
    """Token events past the advantage cutoff are recorded but grant nothing (#102)."""
    season = insert_season(db_conn, advantage_lock_episode=5)
    ep = insert_episode(db_conn, season["id"], episode_number=5)  # past cutoff
    c = insert_contestant(db_conn, season["id"], "Token Earner")
    insert_roster_pick(
        db_conn, current_user["id"], season["id"], c["id"], active_from_episode=1
    )

    r = client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "steal_immunity_idol"}],
    )
    assert r.status_code == 200  # event still recorded
    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()[
        "balance"
    ]
    assert balance == 0  # but no tokens granted


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
def test_deleting_scoring_event_clears_its_tokens(client, db_conn, current_user):
    """Additive (#71): token grants are reversed by DELETE, not by re-POST."""
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=1)
    c = insert_contestant(db_conn, season["id"], "Token Earner")
    insert_roster_pick(
        db_conn, current_user["id"], season["id"], c["id"], active_from_episode=1
    )

    created = client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "steal_immunity_idol"}],
    ).json()
    url = f"/seasons/{season['id']}/tokens/{current_user['id']}"
    assert client.get(url).json()["balance"] == 20  # steal_immunity_idol grants 20

    client.delete(f"/scoring-events/{created[0]['id']}")
    assert client.get(url).json()["balance"] == 0


@pytest.mark.integration
def test_other_users_balance_is_private(client, db_conn):
    season = insert_season(db_conn)
    other = insert_user(db_conn, display_name="Other")
    r = client.get(f"/seasons/{season['id']}/tokens/{other['id']}")
    assert r.status_code == 403


@pytest.mark.integration
def test_token_history_owner_only(client, db_conn, current_user):
    season = insert_season(db_conn)
    other = insert_user(db_conn, display_name="Other")
    r = client.get(f"/seasons/{season['id']}/tokens/{other['id']}/history")
    assert r.status_code == 403


@pytest.mark.integration
def test_token_history_describes_gameplay_event(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=1)
    c = insert_contestant(db_conn, season["id"], "Earner")
    insert_roster_pick(db_conn, current_user["id"], season["id"], c["id"])
    client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "survivor_moment"}],
    )
    r = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}/history")
    assert r.status_code == 200
    entries = r.json()
    assert len(entries) == 1
    assert entries[0]["transaction_type"] == "gameplay_event"
    assert entries[0]["amount"] == 5
    assert entries[0]["episode_number"] == 1
    assert "Earner" in entries[0]["description"]
