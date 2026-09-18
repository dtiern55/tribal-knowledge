from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg2 import errors as pg_errors

from app import database
from app.auth import get_current_user
from app.locking import (
    EPISODE_LOCKED_SQL,
    episode_locked_sql,
    latest_locked_episode,
    next_open_episode,
)
from app.schemas import (
    RosterPick,
    RosterSubmitRequest,
    RosterSwapRequest,
    SoleSurvivorRequest,
)

router = APIRouter(tags=["roster"])


def _swap_penalty(ls, ordinal: int) -> int:
    """What the Nth swap of the season costs (#404): the first free_swaps are
    free, then step * N, floored. Mirrors nextSwapCost in MySeasonPage."""
    if ordinal <= ls["free_swaps"]:
        return 0
    # Both operands are <= 0, so max() applies the floor.
    return max(ls["swap_penalty_step"] * ordinal, ls["swap_penalty_floor"])


SWAP_LOCK_DEFAULT = 8  # last swappable episode is the one before this (#84)


def effective_swap_lock(ls) -> int:
    """The episode from which roster swaps are locked (#84): the explicit
    swap_lock_episode, else the default. So the last swappable episode is the
    one before it. The finale is refused separately, regardless of this value."""
    lock = ls["swap_lock_episode"]
    return lock if lock is not None else SWAP_LOCK_DEFAULT


def swaps_locked(cur, ls) -> bool:
    """Swaps — and the Sole Survivor pick that rides them (one dial, #84) — are
    locked once the next open episode reaches the swap lock, and always on the
    finale. No open episode means play is over: everything is locked."""
    nxt = next_open_episode(cur, ls)
    return (
        nxt is None
        or bool(nxt["is_finale"])
        or nxt["episode_number"] >= effective_swap_lock(ls)
    )


def ss_designation_open(cur, ls) -> bool:
    """Whether the Sole Survivor pick can be set right now. It shares the swap
    lock (one dial, no merge): it opens going into the last swappable episode
    (swap lock - 1) — the one the roster finalizes on — and locks with the swaps
    when that episode locks."""
    nxt = next_open_episode(cur, ls)
    if nxt is None or nxt["is_finale"]:
        return False
    lock = effective_swap_lock(ls)
    return lock - 1 <= nxt["episode_number"] < lock


def ss_revealed(cur, ls) -> bool:
    """Whether other players' Sole Survivor picks are public: once the
    designation window has closed, i.e. the last swappable episode
    (swap lock - 1) has locked. Distinct from swaps_locked, which is also true
    while any earlier episode is airing: a locked week 2 must not show a pick
    that could not even be named yet."""
    locked_through = latest_locked_episode(cur, ls["season_id"]) or 0
    return locked_through >= effective_swap_lock(ls) - 1


@router.get(
    "/league-seasons/{league_season_id}/roster/{user_id}",
    response_model=list[RosterPick],
)
def get_roster(
    league_season_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], current_user)
            database.require_roster_visible(cur, ls, user_id, current_user)
            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and league_season_id = %s
                order by active_from_episode, contestant_id
                """,
                [str(user_id), str(league_season_id)],
            )
            rows = cur.fetchall()

            if str(user_id) != str(current_user):
                # Bound another player's roster to the latest LOCKED episode so
                # undoable strategy stays hidden, but their already-locked swap
                # history is public (#164 follow-up).
                #
                # - A pending swap-IN lands in a still-open episode
                #   (active_from > locked_through): hide the incoming pick.
                # - The swap-OUT it pairs with is likewise pending — the swap
                #   books at active_until + 1, so active_until >= locked_through
                #   means that episode hasn't locked. Mask active_until so the
                #   outgoing pick still reads as rostered.
                # - A swap whose episode has already locked
                #   (active_until < locked_through) is history: show it as-is.
                locked_through = latest_locked_episode(cur, ls["season_id"])
                visible = []
                for r in rows:
                    if (
                        locked_through is None
                        or r["active_from_episode"] > locked_through
                    ):
                        continue
                    if (
                        r["active_until_episode"] is not None
                        and r["active_until_episode"] >= locked_through
                    ):
                        r["active_until_episode"] = None
                    visible.append(r)
                rows = visible
                # Another player's designation is strategy until it locks (#164):
                # the roster may already be visible, the flag is not.
                if not ss_revealed(cur, ls):
                    for r in rows:
                        r["is_sole_survivor"] = False
            return rows


@router.post(
    "/league-seasons/{league_season_id}/roster", response_model=list[RosterPick]
)
def submit_roster(
    league_season_id: UUID,
    body: RosterSubmitRequest,
    user_id: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], user_id)

            if ls["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            if ls["roster_lock_episode"] is None:
                raise HTTPException(
                    status_code=400,
                    detail="Roster lock episode not set for this season",
                )

            cur.execute(
                f"""
                select id from episodes
                where season_id = %s and episode_number = %s
                  and {EPISODE_LOCKED_SQL}
                """,
                [str(ls["season_id"]), ls["roster_lock_episode"]],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="Roster submission window has closed",
                )

            if len(body.contestant_ids) != ls["roster_size"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Expected {ls['roster_size']} contestants,"
                        f" got {len(body.contestant_ids)}"
                    ),
                )

            if len(body.contestant_ids) != len(set(body.contestant_ids)):
                raise HTTPException(
                    status_code=400, detail="Duplicate contestants in roster"
                )

            # Free rearranging before the roster locks (issue #84): the window
            # is still open (checked above), rosters haven't scored yet, so a
            # re-submit simply replaces the previous picks — no swap penalty.
            cur.execute(
                "delete from roster_picks where user_id = %s and league_season_id = %s",
                [str(user_id), str(league_season_id)],
            )

            ids = [str(c) for c in body.contestant_ids]
            cur.execute(
                "select id::text as id from contestants"
                " where season_id = %s and id::text = any(%s)",
                [str(ls["season_id"]), ids],
            )
            valid_id_strs = {row["id"] for row in cur.fetchall()}
            invalid = [c for c in ids if c not in valid_id_strs]
            if invalid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Contestants not in this season: {invalid}",
                )

            # A Double Castaway Points play on someone no longer rostered would
            # read as played and score nothing. Drop it with them.
            cur.execute(
                """
                delete from advantage_plays
                where user_id = %s and league_season_id = %s
                  and advantage_type = 'double_roster_points'
                  and not (target_contestant_id::text = any(%s))
                """,
                [str(user_id), str(league_season_id), ids],
            )

            rows = []
            try:
                for cid in body.contestant_ids:
                    cur.execute(
                        """
                        insert into roster_picks
                            (user_id, league_season_id, contestant_id,
                             active_from_episode)
                        values (%s, %s, %s, %s)
                        returning *
                        """,
                        [
                            str(user_id),
                            str(league_season_id),
                            str(cid),
                            ls["roster_lock_episode"],
                        ],
                    )
                    rows.append(cur.fetchone())
            except pg_errors.UniqueViolation:
                # Concurrent double-submit raced past the check above
                raise HTTPException(
                    status_code=409, detail="Roster already submitted for this season"
                )
            return rows


@router.post(
    "/league-seasons/{league_season_id}/roster/swap", response_model=RosterPick
)
def swap_roster_pick(
    league_season_id: UUID,
    body: RosterSwapRequest,
    user_id: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], user_id)
            # Guards the penalty count below against concurrent swaps.
            database.lock_user_season(cur, user_id, league_season_id)

            if ls["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            # Swaps take effect immediately, from the next open episode (#9).
            episode = next_open_episode(cur, ls)
            if not episode:
                raise HTTPException(
                    status_code=400, detail="No open episode to swap into"
                )

            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and league_season_id = %s
                  and contestant_id = %s and active_until_episode is null
                """,
                [str(user_id), str(league_season_id), str(body.old_contestant_id)],
            )
            old_pick = cur.fetchone()
            if not old_pick:
                raise HTTPException(
                    status_code=400,
                    detail="Contestant is not on the active roster",
                )

            swap_episode = episode["episode_number"]
            if swap_episode <= old_pick["active_from_episode"]:
                raise HTTPException(
                    status_code=400,
                    detail="Swap episode must be after the contestant was added",
                )

            # Swaps lock late-game (issue #84); the finale itself is always
            # off-limits.
            swap_lock = effective_swap_lock(ls)
            if episode["is_finale"] or (
                swap_lock is not None and swap_episode >= swap_lock
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Roster swaps are locked for the rest of the season",
                )

            cur.execute(
                "select id, name from contestants where id = %s and season_id = %s",
                [str(body.new_contestant_id), str(ls["season_id"])],
            )
            new_contestant = cur.fetchone()
            if not new_contestant:
                raise HTTPException(
                    status_code=400,
                    detail="New contestant not found in this season",
                )

            cur.execute(
                "select e.id from eliminations e"
                " join episodes ep on ep.id = e.episode_id"
                " where e.contestant_id = %s and e.is_final"
                f" and {episode_locked_sql('ep')}",
                [str(body.new_contestant_id)],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="Contestant has already been eliminated",
                )

            # Explicit check — unique constraint would fire otherwise
            cur.execute(
                "select id from roster_picks"
                " where user_id = %s and league_season_id = %s and contestant_id = %s",
                [str(user_id), str(league_season_id), str(body.new_contestant_id)],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="Contestant has already been on this roster",
                )

            # Swaps are priced in points (#403/#404) and no longer touch the
            # weekly play; there is no per-episode cap either, the rising
            # price is the rate limit. The cost is written onto the pick being
            # closed, so scoring attributes it to the castaway you dropped.
            # There is deliberately no exception for dropping someone already
            # voted out — that charge is the soft form of "losing a castaway
            # costs you".
            cur.execute(
                "select count(*) as n from roster_picks"
                " where user_id = %s and league_season_id = %s"
                " and active_until_episode is not null",
                [str(user_id), str(league_season_id)],
            )
            penalty = _swap_penalty(ls, cur.fetchone()["n"] + 1)

            # The Sole Survivor flag leaves with the castaway, so the pick is
            # free to name someone else without an Undo first.
            cur.execute(
                """
                update roster_picks
                set active_until_episode = %s, swap_penalty_points = %s,
                    is_sole_survivor = false
                where id = %s
                """,
                [swap_episode - 1, penalty, str(old_pick["id"])],
            )

            # A Double Castaway Points play resting on the outgoing castaway
            # would read as played and score nothing (scoring joins on the
            # active roster). It leaves with them; the swap's undo does not
            # bring it back.
            cur.execute(
                """
                delete from advantage_plays
                where user_id = %s and league_season_id = %s and episode_id = %s
                  and advantage_type = 'double_roster_points'
                  and target_contestant_id = %s
                """,
                [
                    str(user_id),
                    str(league_season_id),
                    episode["id"],
                    str(body.old_contestant_id),
                ],
            )

            cur.execute(
                """
                insert into roster_picks
                    (user_id, league_season_id, contestant_id,
                     active_from_episode, replaced_pick_id)
                values (%s, %s, %s, %s, %s)
                returning *
                """,
                [
                    str(user_id),
                    str(league_season_id),
                    str(body.new_contestant_id),
                    swap_episode,
                    str(old_pick["id"]),
                ],
            )
            new_pick = cur.fetchone()

            return new_pick


@router.delete(
    "/league-seasons/{league_season_id}/roster/swap/{contestant_id}",
    status_code=204,
)
def undo_roster_swap(
    league_season_id: UUID,
    contestant_id: UUID,
    user_id: UUID = Depends(get_current_user),
):
    """Undo this episode's swap while the episode is still open.

    Reverses the 2026-08-15 "non-refundable" rule: under the points economy a
    swap consumes nothing but a column value, and every other decision on the
    page stays editable until picks lock, so the swap did too (#403 follow-up).

    An exact reversal — the closed pick comes back as it was, penalty cleared,
    and the incoming pick is removed. There is no per-episode allowance to
    restore; #715 dropped that cap and swaps are priced by ordinal instead.
    The one thing it does not bring back is a Sole Survivor flag: the swap
    cleared it, and the pick may have moved on since.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], user_id)
            # Serializes against a concurrent swap in the same episode.
            database.lock_user_season(cur, user_id, league_season_id)

            if ls["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            # Only the open episode's swap is reversible; next_open_episode
            # already excludes anything past its picks_lock_at.
            episode = next_open_episode(cur, ls)
            if not episode:
                raise HTTPException(
                    status_code=400, detail="Episode has locked; the swap is final"
                )
            swap_episode = episode["episode_number"]

            # The swap is the pair (incoming pick, the pick it replaced); more
            # than one can be open in an episode, so the incoming castaway
            # names which.
            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and league_season_id = %s and contestant_id = %s
                  and active_from_episode = %s and active_until_episode is null
                  and replaced_pick_id is not null
                """,
                [str(user_id), str(league_season_id), str(contestant_id), swap_episode],
            )
            added = cur.fetchone()
            if not added:
                raise HTTPException(
                    status_code=400, detail="No swap to undo this episode"
                )

            # A Roster x2 resting on the incoming castaway would be left
            # pointing at someone no longer on the roster. Refuse rather than
            # silently discard the play.
            cur.execute(
                """
                select 1 from advantage_plays
                where user_id = %s and episode_id = %s
                  and advantage_type = 'double_roster_points'
                  and target_contestant_id = %s
                """,
                [str(user_id), episode["id"], str(added["contestant_id"])],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Your Roster x2 is on the castaway you swapped in"
                        " — take it back first"
                    ),
                )

            cur.execute("delete from roster_picks where id = %s", [str(added["id"])])
            cur.execute(
                "update roster_picks"
                " set active_until_episode = null, swap_penalty_points = 0"
                " where id = %s",
                [str(added["replaced_pick_id"])],
            )

            # The episode's other swaps were priced with this one on the
            # ladder; walk them back a rung, in the order they were made.
            cur.execute(
                "select count(*) as n from roster_picks"
                " where user_id = %s and league_season_id = %s"
                " and active_until_episode < %s",
                [str(user_id), str(league_season_id), swap_episode - 1],
            )
            base = cur.fetchone()["n"]
            cur.execute(
                """
                select d.id from roster_picks d
                join roster_picks a on a.replaced_pick_id = d.id
                where d.user_id = %s and d.league_season_id = %s
                  and d.active_until_episode = %s
                order by a.created_at
                """,
                [str(user_id), str(league_season_id), swap_episode - 1],
            )
            for i, row in enumerate(cur.fetchall()):
                cur.execute(
                    "update roster_picks set swap_penalty_points = %s where id = %s",
                    [_swap_penalty(ls, base + i + 1), str(row["id"])],
                )


@router.post(
    "/league-seasons/{league_season_id}/sole-survivor", response_model=RosterPick
)
def designate_sole_survivor(
    league_season_id: UUID,
    body: SoleSurvivorRequest,
    user_id: UUID = Depends(get_current_user),
):
    """Designate one active-roster contestant as your Sole Survivor (#164).

    Free and editable until the designation locks; their finale-episode
    contribution to your roster score is doubled.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], user_id)
            if ls["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            if swaps_locked(cur, ls):
                raise HTTPException(
                    status_code=400,
                    detail="Sole Survivor pick is locked for the rest of the season",
                )
            if not ss_designation_open(cur, ls):
                raise HTTPException(
                    status_code=400,
                    detail="Sole Survivor pick has not opened yet",
                )

            cur.execute(
                """
                select id from roster_picks
                where user_id = %s and league_season_id = %s and contestant_id = %s
                  and active_until_episode is null
                """,
                [str(user_id), str(league_season_id), str(body.contestant_id)],
            )
            pick = cur.fetchone()
            if not pick:
                raise HTTPException(
                    status_code=400,
                    detail="Contestant is not on your active roster",
                )

            # An eliminated castaway can linger on the roster if never swapped
            # out — they're not a valid designee (#180)
            cur.execute(
                "select e.id from eliminations e"
                " join episodes ep on ep.id = e.episode_id"
                " where e.contestant_id = %s and e.is_final"
                f" and {episode_locked_sql('ep')}",
                [str(body.contestant_id)],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="Contestant(s) already eliminated",
                )

            cur.execute(
                "update roster_picks set is_sole_survivor = false"
                " where user_id = %s and league_season_id = %s and is_sole_survivor",
                [str(user_id), str(league_season_id)],
            )
            cur.execute(
                "update roster_picks set is_sole_survivor = true"
                " where id = %s returning *",
                [str(pick["id"])],
            )
            return cur.fetchone()


@router.delete("/league-seasons/{league_season_id}/sole-survivor", status_code=204)
def clear_sole_survivor(
    league_season_id: UUID, user_id: UUID = Depends(get_current_user)
):
    """Clear your Sole Survivor designation (the Undo, #164). Only while the
    designation window is open, same as designating."""
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], user_id)
            if ls["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")
            if swaps_locked(cur, ls):
                raise HTTPException(
                    status_code=400,
                    detail="Sole Survivor pick is locked for the rest of the season",
                )
            cur.execute(
                "update roster_picks set is_sole_survivor = false"
                " where user_id = %s and league_season_id = %s and is_sole_survivor",
                [str(user_id), str(league_season_id)],
            )
