"""The weekly advantage play (#307).

Every player gets exactly one play per episode — no buying, no inventory, no
balance. It lands on the open episode and is reversible until that episode
locks. Spend it on a double, or on a roster swap past the free one
(tests/test_roster.py covers the swap side).
"""

from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_advantage_play,
    insert_contestant,
    insert_elimination,
    insert_elimination_pick,
    insert_episode,
    insert_roster_pick,
    insert_season,
    insert_user,
    score_episode,
)


def _open_episode(conn, season_id, episode_number=1, max_picks=3):
    return insert_episode(
        conn,
        season_id,
        episode_number=episode_number,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
        max_elimination_picks=max_picks,
    )


def _play(client, season_id, advantage_type, target=None, expect=201):
    body = {"advantage_type": advantage_type}
    if target is not None:
        body["target_contestant_id"] = str(target)
    r = client.post(f"/seasons/{season_id}/advantage-plays", json=body)
    assert r.status_code == expect, r.text
    return r.json() if expect == 201 else r


def _rostered(db_conn, season_id, user_id, name="Target"):
    c = insert_contestant(db_conn, season_id, name)
    insert_roster_pick(db_conn, user_id, season_id, c["id"])
    return c


# --- the menu ----------------------------------------------------------


@pytest.mark.integration
def test_list_advantage_types(client):
    """Extra Vote is retired (#307) — it must not appear on the menu."""
    r = client.get("/advantage-types")
    assert r.status_code == 200
    by_type = {a["advantage_type"]: a for a in r.json()}
    assert "extra_vote" not in by_type
    assert "double_roster_points" in by_type
    assert "double_vote_points" in by_type
    assert all(a["enabled"] for a in r.json())


@pytest.mark.integration
def test_playing_a_retired_advantage_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    r = _play(client, season["id"], "extra_vote", expect=400)
    assert "Unknown advantage type" in r.json()["detail"]


@pytest.mark.integration
def test_play_invalid_advantage_type(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    r = _play(client, season["id"], "nonsense", expect=400)
    assert "Unknown advantage type" in r.json()["detail"]


# --- one play per episode ----------------------------------------------


@pytest.mark.integration
def test_play_binds_the_open_episode_and_costs_nothing(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    play = _play(client, season["id"], "double_vote_points")

    assert play["episode_id"] == str(ep["id"])
    assert play["token_cost"] == 0
    balance = client.get(f"/seasons/{season['id']}/tokens/{current_user['id']}").json()
    assert balance["balance"] == 0  # nothing spent, and nothing needed


@pytest.mark.integration
def test_second_play_same_episode_rejected(client, db_conn, current_user):
    """One play per episode, whatever it's spent on."""
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = _rostered(db_conn, season["id"], current_user["id"])
    _play(client, season["id"], "double_vote_points")

    r = _play(client, season["id"], "double_roster_points", target=c["id"], expect=409)
    assert "already used your advantage" in r.json()["detail"]


@pytest.mark.integration
def test_play_allowed_again_in_the_next_episode(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep1 = insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    _open_episode(db_conn, season["id"], episode_number=2)
    insert_advantage_play(db_conn, current_user["id"], ep1["id"], "double_vote_points")
    # Episode 2 is only open once episode 1 is scored (#11).
    score_episode(db_conn, ep1["id"])

    play = _play(client, season["id"], "double_vote_points")
    assert play["episode_id"] != str(ep1["id"])


# --- targets -----------------------------------------------------------


@pytest.mark.integration
def test_double_roster_requires_a_rostered_target(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    stranger = insert_contestant(db_conn, season["id"], "Stranger")

    r = _play(client, season["id"], "double_roster_points", expect=400)
    assert "target_contestant_id" in r.json()["detail"]

    r = _play(
        client, season["id"], "double_roster_points", target=stranger["id"], expect=400
    )
    assert "not on your active roster" in r.json()["detail"]


@pytest.mark.integration
def test_double_vote_takes_no_target(client, db_conn, current_user):
    """#303: it covers the whole ballot, so naming a contestant is an error."""
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])

    r = _play(client, season["id"], "double_vote_points", target=c["id"], expect=400)
    assert "does not take a" in r.json()["detail"]

    play = _play(client, season["id"], "double_vote_points")
    assert play["target_contestant_id"] is None


# --- when it's allowed --------------------------------------------------


@pytest.mark.integration
def test_play_blocked_when_no_open_episode(client, db_conn, current_user):
    season = insert_season(db_conn)
    insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    r = _play(client, season["id"], "double_vote_points", expect=400)
    assert "No open episode" in r.json()["detail"]


@pytest.mark.integration
def test_play_blocked_in_finale(client, db_conn, current_user):
    season = insert_season(db_conn)
    insert_episode(
        db_conn,
        season["id"],
        episode_number=13,
        is_finale=True,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    r = _play(client, season["id"], "double_vote_points", expect=400)
    assert "no longer be played" in r.json()["detail"]


@pytest.mark.integration
def test_play_blocked_at_advantage_lock_episode(client, db_conn, current_user):
    season = insert_season(db_conn, advantage_lock_episode=5)
    _open_episode(db_conn, season["id"], episode_number=5)
    r = _play(client, season["id"], "double_vote_points", expect=400)
    assert "no longer be played" in r.json()["detail"]


@pytest.mark.integration
def test_play_takes_user_season_advisory_lock(client, db_conn, current_user):
    """#110: the one-play check is a count-then-insert, so it needs the lock.

    The test transaction never commits, so a lock taken inside the handler is
    still visible in pg_locks here.
    """
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    _play(client, season["id"], "double_vote_points")

    with db_conn.cursor() as cur:
        cur.execute(
            "select count(*) as n from pg_locks"
            " where locktype = 'advisory' and pid = pg_backend_pid()"
        )
        assert cur.fetchone()["n"] == 1


# --- taking it back -----------------------------------------------------


@pytest.mark.integration
def test_take_back_frees_the_week(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = _rostered(db_conn, season["id"], current_user["id"])
    play = _play(client, season["id"], "double_vote_points")

    assert client.delete(f"/advantage-plays/{play['id']}").status_code == 204
    # The allowance is free again, so a different choice is now possible
    again = _play(client, season["id"], "double_roster_points", target=c["id"])
    assert again["advantage_type"] == "double_roster_points"


@pytest.mark.integration
def test_take_back_after_lock_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    play = _play(client, season["id"], "double_vote_points")
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = %s where id = %s",
            [datetime.now(timezone.utc) - timedelta(hours=1), str(ep["id"])],
        )

    r = client.delete(f"/advantage-plays/{play['id']}")
    assert r.status_code == 400
    assert "spent" in r.json()["detail"]


@pytest.mark.integration
def test_take_back_roster_swap_rejected(client, db_conn, current_user):
    """The swap it paid for already happened — undo the swap, not the play."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    play = insert_advantage_play(db_conn, current_user["id"], ep["id"], "roster_swap")
    r = client.delete(f"/advantage-plays/{play['id']}")
    assert r.status_code == 400
    assert "Undo the roster swap" in r.json()["detail"]


@pytest.mark.integration
def test_take_back_other_users_play_not_found(client, db_conn, current_user):
    """404, not 403 — don't leak what another player has played."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    other = insert_user(db_conn, display_name="Other")
    play = insert_advantage_play(db_conn, other["id"], ep["id"], "double_vote_points")

    assert client.delete(f"/advantage-plays/{play['id']}").status_code == 404


# --- what a play earned -------------------------------------------------


@pytest.mark.integration
def test_played_double_vote_reports_points_earned(client, db_conn, current_user):
    """Play history shows the bonus a played double actually earned (#85)."""
    season = insert_season(db_conn, merge_episode=7)
    ep = _open_episode(db_conn, season["id"], episode_number=2)
    c = insert_contestant(db_conn, season["id"])
    play = _play(client, season["id"], "double_vote_points")
    # The double pays only on picks the user actually made (#115).
    insert_elimination_pick(db_conn, current_user["id"], ep["id"], c["id"])
    insert_elimination(db_conn, ep["id"], c["id"])

    plays = client.get(
        f"/seasons/{season['id']}/advantage-plays/{current_user['id']}"
    ).json()
    played = next(p for p in plays if p["id"] == play["id"])
    assert played["points_earned"] == 15  # pre-merge correct_elimination value


@pytest.mark.integration
def test_double_vote_earns_zero_without_a_matching_pick(client, db_conn, current_user):
    """#115: report 0, never a phantom bonus the score didn't award."""
    season = insert_season(db_conn, merge_episode=7)
    ep = _open_episode(db_conn, season["id"], episode_number=2)
    c = insert_contestant(db_conn, season["id"])
    play = _play(client, season["id"], "double_vote_points")
    insert_elimination(db_conn, ep["id"], c["id"])  # eliminated, but never picked

    plays = client.get(
        f"/seasons/{season['id']}/advantage-plays/{current_user['id']}"
    ).json()
    played = next(p for p in plays if p["id"] == play["id"])
    assert played["points_earned"] == 0


# --- privacy ------------------------------------------------------------


@pytest.mark.integration
def test_other_users_play_hidden_until_episode_locks(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    other = insert_user(db_conn, display_name="Other")
    insert_advantage_play(db_conn, other["id"], ep["id"], "double_vote_points")

    plays = client.get(f"/seasons/{season['id']}/advantage-plays/{other['id']}").json()
    assert plays == []


@pytest.mark.integration
def test_other_users_play_visible_after_episode_locks(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    other = insert_user(db_conn, display_name="Other")
    insert_advantage_play(db_conn, other["id"], ep["id"], "double_vote_points")

    plays = client.get(f"/seasons/{season['id']}/advantage-plays/{other['id']}").json()
    assert len(plays) == 1
