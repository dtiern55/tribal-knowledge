"""What the Standings torches show once a swap is pending (#164, #457)."""

from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_roster_pick,
    insert_season,
    insert_user,
)


def _entry(client, season, user_id):
    rows = client.get(f"/league-seasons/{season['league_season_id']}/standings").json()
    return next(r for r in rows if r["user_id"] == str(user_id))


def _lit(client, season, user_id):
    return {s["name"] for s in _entry(client, season, user_id)["active_survivors"]}


def _snuffed(client, season, user_id):
    return {
        s["name"]
        for s in _entry(client, season, user_id)["recently_eliminated_survivors"]
    }


def _lock(db_conn, episode_id):
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = %s where id = %s",
            [datetime.now(timezone.utc) - timedelta(hours=1), str(episode_id)],
        )


@pytest.mark.integration
def test_swapping_the_corpse_out_keeps_its_snuffed_torch(client, db_conn, current_user):
    """The torch records the episode they died in, not who is rostered today.

    S27 episode 3: Rachel went out while on 13 rosters and 11 of them swapped
    her away that night, which erased almost every trace of the boot.
    """
    season = insert_season(db_conn, roster_lock_episode=1)
    ep1 = insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    insert_episode(db_conn, season["id"], episode_number=2)  # open, not locked
    boot = insert_contestant(db_conn, season["id"], "Boot")
    replacement = insert_contestant(db_conn, season["id"], "Fresh")
    # Swapped out for episode 2: still on the roster through episode 1.
    insert_roster_pick(
        db_conn,
        current_user["id"],
        season["id"],
        boot["id"],
        active_from_episode=1,
        active_until_episode=1,
    )
    insert_roster_pick(
        db_conn,
        current_user["id"],
        season["id"],
        replacement["id"],
        active_from_episode=2,
    )
    insert_elimination(db_conn, ep1["id"], boot["id"], is_final=True)

    assert _snuffed(client, season, current_user["id"]) == {"Boot"}
    assert "Boot" not in _lit(client, season, current_user["id"])


@pytest.mark.integration
def test_another_players_pending_swap_stays_hidden_until_it_locks(
    client, db_conn, current_user
):
    """#164: a swap into a still-open episode is undoable strategy."""
    season = insert_season(db_conn, roster_lock_episode=1)
    insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    rival = insert_user(db_conn, display_name="Rival")
    dropped = insert_contestant(db_conn, season["id"], "Dropped")
    added = insert_contestant(db_conn, season["id"], "Added")
    insert_roster_pick(
        db_conn,
        rival["id"],
        season["id"],
        dropped["id"],
        active_from_episode=1,
        active_until_episode=1,
    )
    insert_roster_pick(
        db_conn, rival["id"], season["id"], added["id"], active_from_episode=2
    )

    assert _lit(client, season, rival["id"]) == {"Dropped"}

    _lock(db_conn, ep2["id"])
    assert _lit(client, season, rival["id"]) == {"Added"}


@pytest.mark.integration
def test_your_own_pending_swap_waits_for_the_lock_too(client, db_conn, current_user):
    """Standings is the league as of the last locked episode, your row included.

    The Team page shows your own pending swap; here it would pair next week's
    roster with last week's points, and sit beside the snuffed torch of the
    castaway it replaced — two torches for one slot.
    """
    season = insert_season(db_conn, roster_lock_episode=1)
    insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    dropped = insert_contestant(db_conn, season["id"], "Dropped")
    added = insert_contestant(db_conn, season["id"], "Added")
    insert_roster_pick(
        db_conn,
        current_user["id"],
        season["id"],
        dropped["id"],
        active_from_episode=1,
        active_until_episode=1,
    )
    insert_roster_pick(
        db_conn,
        current_user["id"],
        season["id"],
        added["id"],
        active_from_episode=2,
    )

    assert _lit(client, season, current_user["id"]) == {"Dropped"}

    _lock(db_conn, ep2["id"])
    assert _lit(client, season, current_user["id"]) == {"Added"}


@pytest.mark.integration
def test_snuffed_torches_clear_when_the_next_episode_locks(
    client, db_conn, current_user
):
    """They stay through the wait and the airing, then go at the next lock.

    Holding them past that would stack them on top of the replacements, which
    go live at the same moment, and push the row past its roster size.
    """
    season = insert_season(db_conn, roster_lock_episode=1)
    ep1 = insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    boot = insert_contestant(db_conn, season["id"], "Boot")
    insert_roster_pick(
        db_conn,
        current_user["id"],
        season["id"],
        boot["id"],
        active_from_episode=1,
        active_until_episode=1,
    )
    insert_elimination(db_conn, ep1["id"], boot["id"], is_final=True)

    assert _snuffed(client, season, current_user["id"]) == {"Boot"}

    _lock(db_conn, ep2["id"])
    assert _snuffed(client, season, current_user["id"]) == set()
