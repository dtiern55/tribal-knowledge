import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_season,
)


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
def test_get_roster_empty(client, db_conn, current_user):
    season = insert_season(db_conn)
    r = client.get(f"/seasons/{season['id']}/roster/{current_user['id']}")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_get_roster_season_not_found(client):
    r = client.get(f"/seasons/{uuid.uuid4()}/roster/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.integration
def test_submit_roster(client, db_conn, current_user):
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 3
    assert all(p["active_from_episode"] == 2 for p in data)
    assert all(p["active_until_episode"] is None for p in data)
    assert all(p["swap_penalty_points"] == 0 for p in data)


@pytest.mark.integration
def test_submit_roster_appears_in_get(client, db_conn, current_user):
    season, contestants = _make_season_with_roster(db_conn)
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    r = client.get(f"/seasons/{season['id']}/roster/{current_user['id']}")
    assert r.status_code == 200
    assert len(r.json()) == 3


@pytest.mark.integration
def test_submit_roster_wrong_count(client, db_conn):
    season, contestants = _make_season_with_roster(db_conn, roster_size=3)
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(contestants[0]["id"])]},
    )
    assert r.status_code == 400
    assert "Expected 3" in r.json()["detail"]


@pytest.mark.integration
def test_submit_roster_invalid_contestant(client, db_conn):
    season = insert_season(db_conn, roster_size=1, roster_lock_episode=2)
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(uuid.uuid4())]},
    )
    assert r.status_code == 400


@pytest.mark.integration
def test_submit_roster_no_lock_episode(client, db_conn):
    season = insert_season(db_conn, roster_size=1)  # no roster_lock_episode
    contestant = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(contestant["id"])]},
    )
    assert r.status_code == 400
    assert "lock episode" in r.json()["detail"]


@pytest.mark.integration
def test_resubmit_before_lock_replaces_free(client, db_conn, current_user):
    # Free rearranging before the roster locks (issue #84): re-submitting a
    # different roster replaces the old one with no swap penalty.
    season, contestants = _make_season_with_roster(db_conn, roster_size=3)
    other = insert_contestant(db_conn, season["id"], "Swapped In")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={
            "contestant_ids": [
                str(contestants[0]["id"]),
                str(contestants[1]["id"]),
                str(other["id"]),
            ]
        },
    )
    assert r.status_code == 200
    roster = client.get(f"/seasons/{season['id']}/roster/{current_user['id']}").json()
    assert len(roster) == 3
    assert all(p["swap_penalty_points"] == 0 for p in roster)
    assert all(p["active_until_episode"] is None for p in roster)
    assert {p["contestant_id"] for p in roster} == {
        str(contestants[0]["id"]),
        str(contestants[1]["id"]),
        str(other["id"]),
    }


@pytest.mark.integration
def test_submit_roster_duplicate_contestant_ids(client, db_conn):
    season, contestants = _make_season_with_roster(db_conn, roster_size=3)
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={
            "contestant_ids": [
                str(contestants[0]["id"]),
                str(contestants[0]["id"]),
                str(contestants[1]["id"]),
            ]
        },
    )
    assert r.status_code == 400
    assert "Duplicate" in r.json()["detail"]


@pytest.mark.integration
def test_swap_roster_pick(client, db_conn, current_user):
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    new_contestant = insert_contestant(db_conn, season["id"], "New Player")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new_contestant["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    assert r.status_code == 200
    new_pick = r.json()
    assert new_pick["contestant_id"] == str(new_contestant["id"])
    assert new_pick["active_from_episode"] == 3

    roster = client.get(f"/seasons/{season['id']}/roster/{current_user['id']}").json()
    old = next(p for p in roster if p["contestant_id"] == str(contestants[0]["id"]))
    assert old["active_until_episode"] == 2
    assert old["swap_penalty_points"] == -20


@pytest.mark.integration
def test_swap_uses_configured_penalty(client, db_conn, current_user):
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2, swap_penalty_points=-10
    )
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    new_contestant = insert_contestant(db_conn, season["id"], "New Player")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new_contestant["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    roster = client.get(f"/seasons/{season['id']}/roster/{current_user['id']}").json()
    old = next(p for p in roster if p["contestant_id"] == str(contestants[0]["id"]))
    assert old["swap_penalty_points"] == -10


@pytest.mark.integration
def test_swap_cap_reached(client, db_conn):
    # max_swaps=1: the second real swap is rejected (issue #84).
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2, max_swaps=1
    )
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    new1 = insert_contestant(db_conn, season["id"], "New 1")
    new2 = insert_contestant(db_conn, season["id"], "New 2")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    first = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new1["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    assert first.status_code == 200
    second = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[1]["id"]),
            "new_contestant_id": str(new2["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    assert second.status_code == 400
    assert "Swap limit" in second.json()["detail"]


@pytest.mark.integration
def test_swaps_locked_after_swap_lock_episode(client, db_conn):
    # swap_lock_episode=3: swaps into ep3+ are disabled (issue #84).
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2, swap_lock_episode=3
    )
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    new = insert_contestant(db_conn, season["id"], "New Player")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    assert r.status_code == 400
    assert "locked" in r.json()["detail"]


@pytest.mark.integration
def test_swap_contestant_not_on_roster(client, db_conn):
    season, contestants = _make_season_with_roster(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=3)
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(uuid.uuid4()),
            "new_contestant_id": str(contestants[0]["id"]),
            "episode_id": str(ep["id"]),
        },
    )
    assert r.status_code == 400


@pytest.mark.integration
def test_swap_re_add_past_contestant(client, db_conn):
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    new_contestant = insert_contestant(db_conn, season["id"], "New Player")
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    ep4 = insert_episode(db_conn, season["id"], episode_number=4)
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new_contestant["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[1]["id"]),
            "new_contestant_id": str(contestants[0]["id"]),
            "episode_id": str(ep4["id"]),
        },
    )
    assert r.status_code == 409


@pytest.mark.integration
def test_submit_roster_blocked_on_completed_season(client, db_conn):
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2, status="completed"
    )
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    assert r.status_code == 400
    assert "complete" in r.json()["detail"]


@pytest.mark.integration
def test_submit_roster_blocked_after_lock(client, db_conn):
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    insert_episode(
        db_conn,
        season["id"],
        episode_number=2,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    r = client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    assert r.status_code == 400
    assert "window" in r.json()["detail"]


@pytest.mark.integration
def test_swap_blocked_on_completed_season(client, db_conn):
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    new_contestant = insert_contestant(db_conn, season["id"], "New Player")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    with db_conn.cursor() as cur:
        cur.execute(
            "update seasons set status = 'completed' where id = %s",
            [str(season["id"])],
        )
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new_contestant["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    assert r.status_code == 400
    assert "complete" in r.json()["detail"]


@pytest.mark.integration
def test_swap_blocked_after_episode_lock(client, db_conn):
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    ep3 = insert_episode(
        db_conn,
        season["id"],
        episode_number=3,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    new_contestant = insert_contestant(db_conn, season["id"], "New Player")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new_contestant["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    assert r.status_code == 400
    # Swaps go to the next open episode (#9); with only a locked one there is none.
    assert "No open episode" in r.json()["detail"]


@pytest.mark.integration
def test_swap_eliminated_contestant_rejected(client, db_conn):
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    new_contestant = insert_contestant(db_conn, season["id"], "Eliminated Player")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    ep2 = insert_episode(
        db_conn,
        season["id"],
        episode_number=2,
        status="scored",
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    insert_elimination(db_conn, ep2["id"], new_contestant["id"])
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new_contestant["id"]),
            "episode_id": str(ep3["id"]),
        },
    )
    assert r.status_code == 400
    assert "eliminated" in r.json()["detail"]


@pytest.mark.integration
def test_other_users_roster_hidden_until_lock(client, db_conn):
    season, _ = _make_season_with_roster(db_conn)
    insert_episode(
        db_conn,
        season["id"],
        episode_number=2,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    r = client.get(f"/seasons/{season['id']}/roster/{uuid.uuid4()}")
    assert r.status_code == 403


@pytest.mark.integration
def test_other_users_roster_visible_after_lock(client, db_conn):
    from tests.helpers import insert_roster_pick, insert_user

    season, contestants = _make_season_with_roster(db_conn)
    insert_episode(
        db_conn,
        season["id"],
        episode_number=2,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    other = insert_user(db_conn, display_name="Other")
    insert_roster_pick(db_conn, other["id"], season["id"], contestants[0]["id"])
    r = client.get(f"/seasons/{season['id']}/roster/{other['id']}")
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.integration
def test_swap_takes_user_season_advisory_lock(client, db_conn, current_user):
    """#113: swapping holds the advisory lock that serializes over-cap swaps."""
    season, contestants = _make_season_with_roster(
        db_conn, roster_size=3, lock_episode=2
    )
    insert_episode(db_conn, season["id"], episode_number=3)
    new_contestant = insert_contestant(db_conn, season["id"], "New Player")
    client.post(
        f"/seasons/{season['id']}/roster",
        json={"contestant_ids": [str(c["id"]) for c in contestants]},
    )
    r = client.post(
        f"/seasons/{season['id']}/roster/swap",
        json={
            "old_contestant_id": str(contestants[0]["id"]),
            "new_contestant_id": str(new_contestant["id"]),
        },
    )
    assert r.status_code == 200

    with db_conn.cursor() as cur:
        cur.execute(
            "select count(*) as n from pg_locks"
            " where locktype = 'advisory' and pid = pg_backend_pid()"
        )
        assert cur.fetchone()["n"] == 1
