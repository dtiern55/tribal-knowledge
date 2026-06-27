import pytest

from tests.helpers import insert_contestant, insert_episode, insert_season, insert_user


@pytest.mark.integration
def test_record_advantage_play(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "user_id": str(current_user["id"]),
            "episode_id": str(ep["id"]),
            "advantage_type": "extra_vote",
            "token_cost": 15,
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["advantage_type"] == "extra_vote"
    assert data["token_cost"] == 15
    assert data["status"] == "resolved_success"


@pytest.mark.integration
def test_advantage_deducts_tokens(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    client.post(
        f"/seasons/{season['id']}/tokens/starting-allocation",
        json={"amount": 20, "user_id": str(current_user["id"])},
    )
    client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "user_id": str(current_user["id"]),
            "episode_id": str(ep["id"]),
            "advantage_type": "extra_vote",
            "token_cost": 15,
        },
    )
    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()[
        "balance"
    ]
    assert balance == 5


@pytest.mark.integration
def test_advantage_zero_cost_no_debit(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "user_id": str(current_user["id"]),
            "episode_id": str(ep["id"]),
            "advantage_type": "immunity_idol",
            "token_cost": 0,
        },
    )
    assert r.status_code == 201
    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()[
        "balance"
    ]
    assert balance == 0


@pytest.mark.integration
def test_advantage_with_target_contestant(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"], "Target")
    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "user_id": str(current_user["id"]),
            "episode_id": str(ep["id"]),
            "advantage_type": "double_roster_points",
            "token_cost": 10,
            "target_contestant_id": str(c["id"]),
        },
    )
    assert r.status_code == 201
    assert r.json()["target_contestant_id"] == str(c["id"])


@pytest.mark.integration
def test_advantage_with_target_user(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    target = insert_user(db_conn, display_name="Target")
    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "user_id": str(current_user["id"]),
            "episode_id": str(ep["id"]),
            "advantage_type": "steal_a_vote",
            "token_cost": 20,
            "target_user_id": str(target["id"]),
        },
    )
    assert r.status_code == 201
    assert r.json()["target_user_id"] == str(target["id"])


@pytest.mark.integration
def test_list_season_advantage_plays(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "user_id": str(current_user["id"]),
            "episode_id": str(ep["id"]),
            "advantage_type": "extra_vote",
            "token_cost": 10,
        },
    )
    r = client.get(f"/seasons/{season['id']}/advantage-plays")
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.integration
def test_list_user_advantage_plays(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    other = insert_user(db_conn, display_name="Other")
    client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "user_id": str(current_user["id"]),
            "episode_id": str(ep["id"]),
            "advantage_type": "extra_vote",
            "token_cost": 10,
        },
    )
    # Other user's play (direct DB insert to avoid needing auth as other user)
    with db_conn.cursor() as cur:
        cur.execute(
            "insert into advantage_plays"
            " (user_id, episode_id, advantage_type, token_cost)"
            " values (%s, %s, 'immunity_idol', 0)",
            [str(other["id"]), str(ep["id"])],
        )
    r = client.get(f"/seasons/{season['id']}/advantage-plays/{current_user['id']}")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["user_id"] == str(current_user["id"])


@pytest.mark.integration
def test_invalid_advantage_type(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    r = client.post(
        f"/seasons/{season['id']}/advantage-plays",
        json={
            "user_id": str(current_user["id"]),
            "episode_id": str(ep["id"]),
            "advantage_type": "super_idol",
            "token_cost": 0,
        },
    )
    assert r.status_code == 400
    assert "Unknown advantage type" in r.json()["detail"]
