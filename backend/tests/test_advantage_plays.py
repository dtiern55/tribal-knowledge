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
    r = client.post(f"/league-seasons/{season_id}/advantage-plays", json=body)
    assert r.status_code == expect, r.text
    return r.json() if expect == 201 else r


def _rostered(db_conn, season_id, user_id, name="Target"):
    c = insert_contestant(db_conn, season_id, name)
    insert_roster_pick(db_conn, user_id, season_id, c["id"])
    return c


def _redemption_tribe(conn, season_id):
    """A Redemption Island tribe (#655), same shape as test_redemption_island.py."""
    with conn.cursor() as cur:
        cur.execute(
            "insert into tribes (season_id, name, color, is_redemption)"
            " values (%s, 'Redemption Island', '#000000', true) returning id",
            [str(season_id)],
        )
        return cur.fetchone()["id"]


def _assign_tribe(conn, contestant_id, tribe_id, from_episode):
    with conn.cursor() as cur:
        cur.execute(
            "insert into contestant_tribes (contestant_id, tribe_id, from_episode)"
            " values (%s, %s, %s)",
            [str(contestant_id), str(tribe_id), from_episode],
        )


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
    r = _play(client, season["league_season_id"], "extra_vote", expect=400)
    assert "Unknown advantage type" in r.json()["detail"]


@pytest.mark.integration
def test_play_invalid_advantage_type(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    r = _play(client, season["league_season_id"], "nonsense", expect=400)
    assert "Unknown advantage type" in r.json()["detail"]


# --- one play per episode ----------------------------------------------


@pytest.mark.integration
def test_play_binds_the_open_episode_and_costs_nothing(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    play = _play(
        client, season["league_season_id"], "double_vote_points", target=c["id"]
    )

    assert play["episode_id"] == str(ep["id"])
    assert play["token_cost"] == 0
    balance = client.get(
        f"/league-seasons/{season['league_season_id']}/tokens/{current_user['id']}"
    ).json()
    assert balance["balance"] == 0  # nothing spent, and nothing needed


@pytest.mark.integration
def test_second_play_same_episode_rejected(client, db_conn, current_user):
    """One play per episode, whatever it's spent on."""
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = _rostered(db_conn, season["id"], current_user["id"])
    target = insert_contestant(db_conn, season["id"], "DoubleTarget")
    _play(client, season["league_season_id"], "double_vote_points", target=target["id"])

    r = _play(
        client,
        season["league_season_id"],
        "double_roster_points",
        target=c["id"],
        expect=409,
    )
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
    ep2 = _open_episode(db_conn, season["id"], episode_number=2)
    insert_advantage_play(db_conn, current_user["id"], ep1["id"], "double_vote_points")
    # Episode 2 is only open once episode 1 is scored (#11).
    score_episode(db_conn, ep1["id"])
    target = insert_contestant(db_conn, season["id"], "Target")

    play = _play(
        client, season["league_season_id"], "double_vote_points", target=target["id"]
    )
    assert play["episode_id"] == str(ep2["id"])
    assert play["episode_id"] != str(ep1["id"])


# --- targets -----------------------------------------------------------


@pytest.mark.integration
def test_double_roster_requires_a_rostered_target(client, db_conn, current_user):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    stranger = insert_contestant(db_conn, season["id"], "Stranger")

    r = _play(client, season["league_season_id"], "double_roster_points", expect=400)
    assert "target_contestant_id" in r.json()["detail"]

    r = _play(
        client,
        season["league_season_id"],
        "double_roster_points",
        target=stranger["id"],
        expect=400,
    )
    assert "not on your active roster" in r.json()["detail"]


@pytest.mark.integration
def test_double_vote_requires_a_target(client, db_conn, current_user):
    """#673: Extra Vote ×2 is now one extra pick, not the whole ballot."""
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])

    r = _play(client, season["league_season_id"], "double_vote_points", expect=400)
    assert "target_contestant_id" in r.json()["detail"]


@pytest.mark.integration
def test_double_vote_target_already_eliminated_rejected(client, db_conn, current_user):
    """The doubled name follows the same eligibility as any ballot pick."""
    season = insert_season(db_conn)
    ep1 = insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    _open_episode(db_conn, season["id"], episode_number=2)
    booted = insert_contestant(db_conn, season["id"], "Booted")
    insert_contestant(db_conn, season["id"], "Other")  # keeps cap above 1
    insert_elimination(db_conn, ep1["id"], booted["id"])
    score_episode(db_conn, ep1["id"])  # episode 2 only opens once 1 is scored (#11)

    r = _play(
        client,
        season["league_season_id"],
        "double_vote_points",
        target=booted["id"],
        expect=400,
    )
    assert "already eliminated" in r.json()["detail"]


@pytest.mark.integration
def test_double_vote_target_on_redemption_island_rejected(
    client, db_conn, current_user
):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    resident = insert_contestant(db_conn, season["id"], "Resident")
    island = _redemption_tribe(db_conn, season["id"])
    _assign_tribe(db_conn, resident["id"], island, from_episode=1)

    r = _play(
        client,
        season["league_season_id"],
        "double_vote_points",
        target=resident["id"],
        expect=400,
    )
    assert "Redemption Island" in r.json()["detail"]


@pytest.mark.integration
def test_double_vote_play_stores_target_and_adds_the_pick(
    client, db_conn, current_user
):
    """Playing it is always a pick (#673) — no separate ballot step needed."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])

    play = _play(
        client, season["league_season_id"], "double_vote_points", target=c["id"]
    )
    assert play["target_contestant_id"] == str(c["id"])

    picks = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks/{current_user['id']}"
    ).json()
    assert [p["contestant_id"] for p in picks] == [str(c["id"])]


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
    r = _play(client, season["league_season_id"], "double_vote_points", expect=400)
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
    r = _play(client, season["league_season_id"], "double_vote_points", expect=400)
    assert "no longer be played" in r.json()["detail"]


@pytest.mark.integration
def test_play_blocked_at_advantage_lock_episode(client, db_conn, current_user):
    season = insert_season(db_conn, advantage_lock_episode=5)
    _open_episode(db_conn, season["id"], episode_number=5)
    r = _play(client, season["league_season_id"], "double_vote_points", expect=400)
    assert "no longer be played" in r.json()["detail"]


@pytest.mark.integration
def test_play_takes_user_season_advisory_lock(client, db_conn, current_user):
    """#110: the one-play check is a count-then-insert, so it needs the lock.

    The test transaction never commits, so a lock taken inside the handler is
    still visible in pg_locks here.
    """
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    _play(client, season["league_season_id"], "double_vote_points", target=c["id"])

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
    target = insert_contestant(db_conn, season["id"], "DoubleTarget")
    play = _play(
        client, season["league_season_id"], "double_vote_points", target=target["id"]
    )

    assert client.delete(f"/advantage-plays/{play['id']}").status_code == 204
    # The allowance is free again, so a different choice is now possible
    again = _play(
        client, season["league_season_id"], "double_roster_points", target=c["id"]
    )
    assert again["advantage_type"] == "double_roster_points"


@pytest.mark.integration
def test_take_back_after_lock_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    play = _play(
        client, season["league_season_id"], "double_vote_points", target=c["id"]
    )
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = %s where id = %s",
            [datetime.now(timezone.utc) - timedelta(hours=1), str(ep["id"])],
        )

    r = client.delete(f"/advantage-plays/{play['id']}")
    assert r.status_code == 400
    assert "spent" in r.json()["detail"]


def _picks(client, season_id, episode_id, user_id):
    return client.get(
        f"/league-seasons/{season_id}/episodes/{episode_id}/picks/{user_id}"
    ).json()


def _submit(client, season_id, episode_id, contestant_ids, doubled=None, expect=200):
    body = {"contestant_ids": [str(c) for c in contestant_ids]}
    if doubled is not None:
        body["doubled_contestant_id"] = str(doubled)
    r = client.post(
        f"/league-seasons/{season_id}/episodes/{episode_id}/picks", json=body
    )
    assert r.status_code == expect, r.text
    return r.json()


@pytest.mark.integration
def test_take_back_drops_the_doubled_pick(client, db_conn, current_user):
    """Taking the ×2 back always drops the doubled pick itself (Danny's call)
    — not whichever is newest."""
    season = insert_season(db_conn)
    ls = season["league_season_id"]
    ep = _open_episode(db_conn, season["id"], max_picks=1)
    a = insert_contestant(db_conn, season["id"], "A")
    b = insert_contestant(db_conn, season["id"], "B")
    insert_contestant(db_conn, season["id"], "C")
    insert_contestant(db_conn, season["id"], "D")

    _submit(client, ls, ep["id"], [a["id"]])
    play = _play(client, ls, "double_vote_points", target=b["id"])

    assert client.delete(f"/advantage-plays/{play['id']}").status_code == 204

    picks = _picks(client, ls, ep["id"], current_user["id"])
    assert [p["contestant_id"] for p in picks] == [str(a["id"])]


@pytest.mark.integration
def test_take_back_drops_the_doubled_pick_even_if_older(client, db_conn, current_user):
    """The doubled pick goes even when it's the older of the two — creation
    order doesn't matter any more, only which pick currently holds the ×2."""
    season = insert_season(db_conn)
    ls = season["league_season_id"]
    ep = _open_episode(db_conn, season["id"], max_picks=1)
    a = insert_contestant(db_conn, season["id"], "A")
    b = insert_contestant(db_conn, season["id"], "B")
    insert_contestant(db_conn, season["id"], "C")
    insert_contestant(db_conn, season["id"], "D")

    _submit(client, ls, ep["id"], [a["id"]])
    play = _play(client, ls, "double_vote_points", target=b["id"])
    # Move the ×2 onto a, the older pick, via a ballot save (#673).
    _submit(client, ls, ep["id"], [a["id"], b["id"]], doubled=a["id"])

    assert client.delete(f"/advantage-plays/{play['id']}").status_code == 204

    picks = _picks(client, ls, ep["id"], current_user["id"])
    assert [p["contestant_id"] for p in picks] == [str(b["id"])]


@pytest.mark.integration
def test_take_back_null_target_play_drops_nothing_within_limit(
    client, db_conn, current_user
):
    """A legacy whole-ballot double (#303, no target) has no single pick to
    drop — the limit-trim safety net leaves an in-limit ballot alone."""
    season = insert_season(db_conn)
    ls = season["league_season_id"]
    ep = _open_episode(db_conn, season["id"], max_picks=2)
    a = insert_contestant(db_conn, season["id"], "A")
    b = insert_contestant(db_conn, season["id"], "B")
    insert_contestant(db_conn, season["id"], "C")

    _submit(client, ls, ep["id"], [a["id"], b["id"]])
    play = insert_advantage_play(
        db_conn, current_user["id"], ep["id"], "double_vote_points"
    )

    assert client.delete(f"/advantage-plays/{play['id']}").status_code == 204

    picks = _picks(client, ls, ep["id"], current_user["id"])
    assert {p["contestant_id"] for p in picks} == {str(a["id"]), str(b["id"])}


@pytest.mark.integration
def test_take_back_roster_swap_rejected(client, db_conn, current_user):
    """Buying a swap is non-refundable (#394): the swap already happened."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    play = insert_advantage_play(db_conn, current_user["id"], ep["id"], "roster_swap")
    r = client.delete(f"/advantage-plays/{play['id']}")
    assert r.status_code == 400
    assert "already made" in r.json()["detail"]


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
    # Playing the ×2 on c is itself the pick (#673) — no separate submit needed.
    play = _play(
        client, season["league_season_id"], "double_vote_points", target=c["id"]
    )
    insert_elimination(db_conn, ep["id"], c["id"])
    # The bonus is only reported once the episode locks (#559).
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = %s where id = %s",
            [datetime.now(timezone.utc) - timedelta(hours=1), str(ep["id"])],
        )

    plays = client.get(
        f"/league-seasons/{season['league_season_id']}/advantage-plays/{current_user['id']}"
    ).json()
    played = next(p for p in plays if p["id"] == play["id"])
    assert played["points_earned"] == 16  # pre-merge correct_elimination value


@pytest.mark.integration
def test_double_vote_earns_zero_without_a_matching_pick(client, db_conn, current_user):
    """#115: report 0, never a phantom bonus the score didn't award."""
    season = insert_season(db_conn, merge_episode=7)
    ep = _open_episode(db_conn, season["id"], episode_number=2)
    target = insert_contestant(db_conn, season["id"], "Target")
    booted = insert_contestant(db_conn, season["id"], "Booted")
    play = _play(
        client, season["league_season_id"], "double_vote_points", target=target["id"]
    )
    insert_elimination(db_conn, ep["id"], booted["id"])  # not the doubled name
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = %s where id = %s",
            [datetime.now(timezone.utc) - timedelta(hours=1), str(ep["id"])],
        )

    plays = client.get(
        f"/league-seasons/{season['league_season_id']}/advantage-plays/{current_user['id']}"
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

    plays = client.get(
        f"/league-seasons/{season['league_season_id']}/advantage-plays/{other['id']}"
    ).json()
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

    plays = client.get(
        f"/league-seasons/{season['league_season_id']}/advantage-plays/{other['id']}"
    ).json()
    assert len(plays) == 1
