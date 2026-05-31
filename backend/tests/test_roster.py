import uuid

import pytest

from tests.helpers import insert_contestant, insert_episode, insert_season, insert_user


def _make_season_with_roster(conn, roster_size=3, lock_episode=2, **season_kwargs):
    season = insert_season(
        conn,
        roster_lock_episode=lock_episode,
        roster_size=roster_size,
        **season_kwargs,
    )
    contestants = [
        insert_contestant(conn, season["id"], f"Player {i}") for i in range(roster_size)
    ]
    return season, contestants


@pytest.mark.integration
def test_get_roster_empty(client, db_conn):
    season = insert_season(db_conn)
    user = insert_user(db_conn)
    r = client.get(f"/seasons/{season['id']}/roster/{user['id']}")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_get_roster_season_not_found(client):
    r = client.get(f"/seasons/{uuid.uuid4()}/roster/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.integration
def test_submit_roster(client, db_conn):
    user = insert_user(db_conn)
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [str(c["id"]) for c in contestants],
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 3
    assert all(p["active_from_episode"] == 2 for p in data)
    assert all(p["active_until_episode"] is None for p in data)
    assert all(p["swap_penalty_points"] == 0 for p in data)


@pytest.mark.integration
def test_submit_roster_appears_in_get(client, db_conn):
    user = insert_user(db_conn)
    season, contestants = _make_season_with_roster(db_conn)
    client.post(
        f"/seasons/{season['id']}/roster",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [str(c["id"]) for c in contestants],
        },
    )
    r = client.get(f"/seasons/{season['id']}/roster/{user['id']}")
    assert r.status_code == 200
    assert len(r.json()) == 3


@pytest.mark.integration
def test_submit_roster_wrong_count(client, db_conn):
    user = insert_user(db_conn)
    season, contestants = _make_season_with_roster(db_conn, roster_size=3)
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [str(contestants[0]["id"])],
        },
    )
    assert r.status_code == 400
    assert "Expected 3" in r.json()["detail"]


@pytest.mark.integration
def test_submit_roster_invalid_contestant(client, db_conn):
    user = insert_user(db_conn)
    season = insert_season(db_conn, roster_size=1, roster_lock_episode=2)
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={"user_id": str(user["id"]), "contestant_ids": [str(uuid.uuid4())]},
    )
    assert r.status_code == 400


@pytest.mark.integration
def test_submit_roster_no_lock_episode(client, db_conn):
    user = insert_user(db_conn)
    season = insert_season(db_conn, roster_size=1)  # no roster_lock_episode
    contestant = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={"user_id": str(user["id"]), "contestant_ids": [str(contestant["id"])]},
    )
    assert r.status_code == 400
    assert "lock episode" in r.json()["detail"]


@pytest.mark.integration
def test_submit_roster_duplicate(client, db_conn):
    user = insert_user(db_conn)
    season, contestants = _make_season_with_roster(db_conn)
    payload = {
        "user_id": str(user["id"]),
        "contestant_ids": [str(c["id"]) for c in contestants],
    }
    client.post(f"/seasons/{season['id']}/roster", json=payload)
    r = client.post(f"/seasons/{season['id']}/roster", json=payload)
    assert r.status_code == 409


@pytest.mark.integration
def test_submit_roster_duplicate_contestant_ids(client, db_conn):
    user = insert_user(db_conn)
    season, contestants = _make_season_with_roster(db_conn, roster_size=3)
    # Same contestant twice — count matches roster_size but is a duplicate.
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [
                str(contestants[0]["id"]),
                str(contestants[0]["id"]),
                str(contestants[1]["id"]),
            ],
        },
    )
    assert r.status_code == 400
    assert "Duplicate" in r.json()["detail"]


@pytest.mark.integration
def test_swap_roster_pick(client, db_conn):
    user = insert_user(db_conn)
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    new_contestant = insert_contestant(db_conn, season["id"], "New Player")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [str(c["id"]) for c in contestants],
        },
    )
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "user_id": str(user["id"]),
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new_contestant["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    assert r.status_code == 200
    new_pick = r.json()
    assert new_pick["contestant_id"] == str(new_contestant["id"])
    assert new_pick["active_from_episode"] == 3

    # Old pick should now be closed with penalty
    roster = client.get(f"/seasons/{season['id']}/roster/{user['id']}").json()
    old = next(p for p in roster if p["contestant_id"] == str(contestants[0]["id"]))
    assert old["active_until_episode"] == 2
    assert old["swap_penalty_points"] == -20


@pytest.mark.integration
def test_swap_uses_configured_penalty(client, db_conn):
    user = insert_user(db_conn)
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2, swap_penalty_points=-10
    )
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    new_contestant = insert_contestant(db_conn, season["id"], "New Player")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [str(c["id"]) for c in contestants],
        },
    )
    client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "user_id": str(user["id"]),
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new_contestant["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    roster = client.get(f"/seasons/{season['id']}/roster/{user['id']}").json()
    old = next(p for p in roster if p["contestant_id"] == str(contestants[0]["id"]))
    assert old["swap_penalty_points"] == -10


@pytest.mark.integration
def test_swap_contestant_not_on_roster(client, db_conn):
    user = insert_user(db_conn)
    season, contestants = _make_season_with_roster(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=3)
    client.post(
        f"/seasons/{season['id']}/roster",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [str(c["id"]) for c in contestants],
        },
    )
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "user_id": str(user["id"]),
            "old_contestant_id": str(uuid.uuid4()),
            "new_contestant_id": str(contestants[0]["id"]),
            "episode_id": str(ep["id"]),
        },
    )
    assert r.status_code == 400


@pytest.mark.integration
def test_swap_re_add_past_contestant(client, db_conn):
    user = insert_user(db_conn)
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    new_contestant = insert_contestant(db_conn, season["id"], "New Player")
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    ep4 = insert_episode(db_conn, season["id"], episode_number=4)
    client.post(
        f"/seasons/{season['id']}/roster",
        json={
            "user_id": str(user["id"]),
            "contestant_ids": [str(c["id"]) for c in contestants],
        },
    )
    # Swap contestants[0] out for new_contestant at ep3
    client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "user_id": str(user["id"]),
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new_contestant["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    # Try to re-add contestants[0] at ep4 — should fail
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "user_id": str(user["id"]),
            "old_contestant_id": str(contestants[1]["id"]),
            "new_contestant_id": str(contestants[0]["id"]),
            "episode_id": str(ep4["id"]),
        },
    )
    assert r.status_code == 409
