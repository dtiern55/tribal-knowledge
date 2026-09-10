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
    rows = client.get(
        f"/league-seasons/{season['league_season_id']}/standings"
    ).json()
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
def test_swapping_the_corpse_out_keeps_its_snuffed_torch(
    client, db_conn, current_user
):
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
def test_your_own_pending_swap_shows_on_your_own_row(
    client, db_conn, current_user
):
    """You already know what you did — hiding it from yourself reads as a bug."""
    season = insert_season(db_conn, roster_lock_episode=1)
    insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    insert_episode(db_conn, season["id"], episode_number=2)
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

    assert _lit(client, season, current_user["id"]) == {"Added"}
