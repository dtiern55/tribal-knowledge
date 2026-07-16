from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_advantage_play,
    insert_contestant,
    insert_episode,
    insert_roster_pick,
    insert_season,
    insert_user,
)


def _open_episode(conn, season_id, episode_number=1, max_picks=3):
    return insert_episode(
        conn,
        season_id,
        episode_number=episode_number,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
        max_elimination_picks=max_picks,
    )


def _fund(client, season_id, user_id, amount=50):
    """Grant starting tokens so buys with a cost pass the balance check."""
    r = client.post(
        f"/seasons/{season_id}/tokens/starting-allocation",
        json={"amount": amount, "user_id": str(user_id)},
    )
    assert r.status_code == 200


def _buy(client, season_id, advantage_type):
    r = client.post(
        f"/seasons/{season_id}/advantage-plays",
        json={"advantage_type": advantage_type},
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.integration
def test_list_advantage_types(client):
    r = client.get("/advantage-types")
    assert r.status_code == 200
    by_type = {a["advantage_type"]: a for a in r.json()}
    assert by_type["double_roster_points"]["token_cost"] == 15
    assert by_type["double_vote_points"]["token_cost"] == 10
    assert by_type["extra_vote"]["token_cost"] == 20
    assert all(a["enabled"] for a in r.json())


# --- buying ------------------------------------------------------------


@pytest.mark.integration
def test_buy_lands_in_inventory(client, db_conn, current_user):
    season = insert_season(db_conn)
    _fund(client, season["id"], current_user["id"])

    play = _buy(client, season["id"], "extra_vote")
    assert play["episode_id"] is None
    assert play["target_contestant_id"] is None
    assert play["season_id"] == str(season["id"])
    assert play["token_cost"] == 20


@pytest.mark.integration
def test_buy_deducts_tokens(client, db_conn, current_user):
    season = insert_season(db_conn)
    _fund(client, season["id"], current_user["id"], amount=20)

    _buy(client, season["id"], "extra_vote")
    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()[
        "balance"
    ]
    assert balance == 0


@pytest.mark.integration
def test_buy_allows_stockpiling_same_type(client, db_conn, current_user):
    season = insert_season(db_conn)
    _fund(client, season["id"], current_user["id"])

    _buy(client, season["id"], "extra_vote")
    _buy(client, season["id"], "extra_vote")
    r = client.get(f"/seasons/{season['id']}/advantage-plays/{current_user['id']}")
    assert len(r.json()) == 2


@pytest.mark.integration
def test_buy_needs_no_open_episode(client, db_conn, current_user):
    season = insert_season(db_conn)  # no episodes at all
    _fund(client, season["id"], current_user["id"])
    _buy(client, season["id"], "extra_vote")


@pytest.mark.integration
def test_buy_insufficient_tokens(client, db_conn, current_user):
    season = insert_season(db_conn)
    _fund(client, season["id"], current_user["id"], amount=10)

    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "extra_vote"},
    )
    assert r.status_code == 400
    assert "Insufficient tokens" in r.json()["detail"]
    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()[
        "balance"
    ]
    assert balance == 10


@pytest.mark.integration
def test_buy_invalid_advantage_type(client, db_conn, current_user):
    season = insert_season(db_conn)
    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "super_idol"},
    )
    assert r.status_code == 400
    assert "Unknown advantage type" in r.json()["detail"]


@pytest.mark.integration
def test_buy_disabled_advantage_type_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    with db_conn.cursor() as cur:
        cur.execute(
            "update advantage_types set enabled = false"
            " where advantage_type = 'extra_vote'"
        )
    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "extra_vote"},
    )
    assert r.status_code == 400
    assert "Unknown advantage type" in r.json()["detail"]


# --- using -------------------------------------------------------------


@pytest.mark.integration
def test_use_binds_open_episode(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"])
    play = _buy(client, season["id"], "extra_vote")

    r = client.post(f"/advantage-plays/{play['id']}/use", json={})
    assert r.status_code == 200
    assert r.json()["episode_id"] == str(ep["id"])


@pytest.mark.integration
def test_use_no_open_episode_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)  # no episodes
    _fund(client, season["id"], current_user["id"])
    play = _buy(client, season["id"], "extra_vote")

    r = client.post(f"/advantage-plays/{play['id']}/use", json={})
    assert r.status_code == 400
    assert "No open episode" in r.json()["detail"]


@pytest.mark.integration
def test_use_double_roster_requires_rostered_target(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"], "Not Rostered")
    _fund(client, season["id"], current_user["id"])
    play = _buy(client, season["id"], "double_roster_points")

    r = client.post(
        f"/advantage-plays/{play['id']}/use",
        json={"target_contestant_id": str(c["id"])},
    )
    assert r.status_code == 400
    assert "active roster" in r.json()["detail"]

    insert_roster_pick(db_conn, current_user["id"], season["id"], c["id"])
    r = client.post(
        f"/advantage-plays/{play['id']}/use",
        json={"target_contestant_id": str(c["id"])},
    )
    assert r.status_code == 200
    assert r.json()["target_contestant_id"] == str(c["id"])


@pytest.mark.integration
def test_use_double_vote_with_season_contestant(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"], "Target")
    _fund(client, season["id"], current_user["id"])
    play = _buy(client, season["id"], "double_vote_points")

    r = client.post(
        f"/advantage-plays/{play['id']}/use",
        json={"target_contestant_id": str(c["id"])},
    )
    assert r.status_code == 200
    assert r.json()["target_contestant_id"] == str(c["id"])


@pytest.mark.integration
def test_use_double_type_requires_target(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"])
    play = _buy(client, season["id"], "double_vote_points")

    r = client.post(f"/advantage-plays/{play['id']}/use", json={})
    assert r.status_code == 400
    assert "target_contestant_id" in r.json()["detail"]


@pytest.mark.integration
def test_use_extra_vote_rejects_target(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"])
    play = _buy(client, season["id"], "extra_vote")

    r = client.post(
        f"/advantage-plays/{play['id']}/use",
        json={"target_contestant_id": str(c["id"])},
    )
    assert r.status_code == 400
    assert "does not take a target_contestant_id" in r.json()["detail"]


@pytest.mark.integration
def test_use_already_in_play_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"])
    play = _buy(client, season["id"], "extra_vote")

    assert client.post(f"/advantage-plays/{play['id']}/use", json={}).status_code == 200
    r = client.post(f"/advantage-plays/{play['id']}/use", json={})
    assert r.status_code == 409
    assert "already in play" in r.json()["detail"]


@pytest.mark.integration
def test_use_same_type_same_episode_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"])
    first = _buy(client, season["id"], "extra_vote")
    second = _buy(client, season["id"], "extra_vote")

    assert (
        client.post(f"/advantage-plays/{first['id']}/use", json={}).status_code == 200
    )
    r = client.post(f"/advantage-plays/{second['id']}/use", json={})
    assert r.status_code == 409


@pytest.mark.integration
def test_use_other_users_play_not_found(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    other = insert_user(db_conn, display_name="Other")
    play = insert_advantage_play(
        db_conn, other["id"], None, "extra_vote", season_id=season["id"]
    )

    r = client.post(f"/advantage-plays/{play['id']}/use", json={})
    assert r.status_code == 404


# --- un-using ----------------------------------------------------------


@pytest.mark.integration
def test_unuse_returns_to_inventory(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"], "Target")
    _fund(client, season["id"], current_user["id"])
    play = _buy(client, season["id"], "double_vote_points")
    client.post(
        f"/advantage-plays/{play['id']}/use",
        json={"target_contestant_id": str(c["id"])},
    )

    r = client.delete(f"/advantage-plays/{play['id']}/use")
    assert r.status_code == 200
    assert r.json()["episode_id"] is None
    assert r.json()["target_contestant_id"] is None

    # No token movement, and the advantage is usable again
    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()[
        "balance"
    ]
    assert balance == 40
    r = client.post(
        f"/advantage-plays/{play['id']}/use",
        json={"target_contestant_id": str(c["id"])},
    )
    assert r.status_code == 200


@pytest.mark.integration
def test_unuse_not_in_play_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    _fund(client, season["id"], current_user["id"])
    play = _buy(client, season["id"], "extra_vote")

    r = client.delete(f"/advantage-plays/{play['id']}/use")
    assert r.status_code == 400
    assert "not in play" in r.json()["detail"]


@pytest.mark.integration
def test_unuse_locked_episode_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    locked_ep = insert_episode(
        db_conn,
        season["id"],
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    play = insert_advantage_play(
        db_conn, current_user["id"], locked_ep["id"], "extra_vote"
    )

    r = client.delete(f"/advantage-plays/{play['id']}/use")
    assert r.status_code == 400
    assert "locked" in r.json()["detail"]


@pytest.mark.integration
def test_unuse_extra_vote_blocked_while_over_pick_limit(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=1)
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    _fund(client, season["id"], current_user["id"])
    play = _buy(client, season["id"], "extra_vote")
    client.post(f"/advantage-plays/{play['id']}/use", json={})
    r = client.post(
        f"/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"]), str(c2["id"])]},
    )
    assert r.status_code == 200

    r = client.delete(f"/advantage-plays/{play['id']}/use")
    assert r.status_code == 400
    assert "Drop an elimination pick first" in r.json()["detail"]

    # Dropping back to the base limit frees the extra vote
    r = client.post(
        f"/episodes/{ep['id']}/picks", json={"contestant_ids": [str(c1["id"])]}
    )
    assert r.status_code == 200
    r = client.delete(f"/advantage-plays/{play['id']}/use")
    assert r.status_code == 200


# --- visibility --------------------------------------------------------


@pytest.mark.integration
def test_list_own_plays_includes_inventory(client, db_conn, current_user):
    season = insert_season(db_conn)
    _fund(client, season["id"], current_user["id"])
    _buy(client, season["id"], "extra_vote")
    r = client.get(f"/seasons/{season['id']}/advantage-plays/{current_user['id']}")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["episode_id"] is None


@pytest.mark.integration
def test_other_users_inventory_hidden(client, db_conn, current_user):
    season = insert_season(db_conn)
    other = insert_user(db_conn, display_name="Other")
    insert_advantage_play(
        db_conn, other["id"], None, "extra_vote", season_id=season["id"]
    )

    r = client.get(f"/seasons/{season['id']}/advantage-plays/{other['id']}")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_other_users_play_hidden_until_episode_locks(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    other = insert_user(db_conn, display_name="Other")
    insert_advantage_play(db_conn, other["id"], ep["id"], "extra_vote", token_cost=20)

    r = client.get(f"/seasons/{season['id']}/advantage-plays/{other['id']}")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_other_users_play_visible_after_episode_locks(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    other = insert_user(db_conn, display_name="Other")
    insert_advantage_play(db_conn, other["id"], ep["id"], "extra_vote", token_cost=20)

    r = client.get(f"/seasons/{season['id']}/advantage-plays/{other['id']}")
    assert len(r.json()) == 1
