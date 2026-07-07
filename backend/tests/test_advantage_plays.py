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


def _open_episode(conn, season_id, episode_number=1):
    return insert_episode(
        conn,
        season_id,
        episode_number=episode_number,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )


def _fund(client, season_id, user_id, amount=50):
    """Grant starting tokens so plays with a cost pass the balance check."""
    r = client.post(
        f"/seasons/{season_id}/tokens/starting-allocation",
        json={"amount": amount, "user_id": str(user_id)},
    )
    assert r.status_code == 200


@pytest.mark.integration
def test_list_advantage_types(client):
    r = client.get("/advantage-types")
    assert r.status_code == 200
    by_type = {a["advantage_type"]: a for a in r.json()}
    assert by_type["double_roster_points"]["token_cost"] == 15
    assert by_type["double_vote_points"]["token_cost"] == 10
    assert by_type["extra_vote"]["token_cost"] == 20
    assert all(a["enabled"] for a in r.json())


@pytest.mark.integration
def test_record_extra_vote(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"])

    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "extra_vote"},
    )
    assert r.status_code == 201
    data = r.json()
    assert data["advantage_type"] == "extra_vote"
    assert data["token_cost"] == 20
    assert data["episode_id"] == str(ep["id"])
    assert data["target_contestant_id"] is None


@pytest.mark.integration
def test_advantage_deducts_tokens(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"], amount=20)

    client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "extra_vote"},
    )
    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()[
        "balance"
    ]
    assert balance == 0


@pytest.mark.integration
def test_double_roster_points_requires_active_roster_target(
    client, db_conn, current_user
):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"], "Not Rostered")
    _fund(client, season["id"], current_user["id"])

    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "advantage_type": "double_roster_points",
            "target_contestant_id": str(c["id"]),
        },
    )
    assert r.status_code == 400
    assert "active roster" in r.json()["detail"]


@pytest.mark.integration
def test_double_roster_points_with_rostered_target(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"], "Rostered")
    insert_roster_pick(db_conn, current_user["id"], season["id"], c["id"])
    _fund(client, season["id"], current_user["id"])

    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "advantage_type": "double_roster_points",
            "target_contestant_id": str(c["id"]),
        },
    )
    assert r.status_code == 201
    assert r.json()["target_contestant_id"] == str(c["id"])


@pytest.mark.integration
def test_double_vote_points_with_season_contestant(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"], "Target")
    _fund(client, season["id"], current_user["id"])

    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "advantage_type": "double_vote_points",
            "target_contestant_id": str(c["id"]),
        },
    )
    assert r.status_code == 201
    assert r.json()["target_contestant_id"] == str(c["id"])


@pytest.mark.integration
def test_double_type_requires_target(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"])

    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "double_vote_points"},
    )
    assert r.status_code == 400
    assert "target_contestant_id" in r.json()["detail"]


@pytest.mark.integration
def test_extra_vote_rejects_target(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"])

    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "extra_vote", "target_contestant_id": str(c["id"])},
    )
    assert r.status_code == 400
    assert "does not take a target_contestant_id" in r.json()["detail"]


@pytest.mark.integration
def test_advantage_insufficient_tokens(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
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
def test_invalid_advantage_type(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])

    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "super_idol"},
    )
    assert r.status_code == 400
    assert "Unknown advantage type" in r.json()["detail"]


@pytest.mark.integration
def test_disabled_advantage_type_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
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


@pytest.mark.integration
def test_no_open_episode_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    # No open episode in the season
    _fund(client, season["id"], current_user["id"])

    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "extra_vote"},
    )
    assert r.status_code == 400
    assert "No open episode" in r.json()["detail"]


@pytest.mark.integration
def test_duplicate_play_same_type_same_episode_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"])

    client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "extra_vote"},
    )
    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "extra_vote"},
    )
    assert r.status_code == 409


@pytest.mark.integration
def test_list_season_advantage_plays(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    _fund(client, season["id"], current_user["id"])
    client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={"advantage_type": "extra_vote"},
    )
    r = client.get(f"/seasons/{season['id']}/advantage-plays")
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.integration
def test_other_users_play_hidden_until_episode_locks(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    other = insert_user(db_conn, display_name="Other")
    insert_advantage_play(db_conn, other["id"], ep["id"], "extra_vote", token_cost=20)

    r = client.get(f"/seasons/{season['id']}/advantage-plays")
    assert r.status_code == 200
    assert r.json() == []

    r2 = client.get(f"/seasons/{season['id']}/advantage-plays/{other['id']}")
    assert r2.status_code == 200
    assert r2.json() == []


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

    r = client.get(f"/seasons/{season['id']}/advantage-plays")
    assert len(r.json()) == 1

    r2 = client.get(f"/seasons/{season['id']}/advantage-plays/{other['id']}")
    assert len(r2.json()) == 1
