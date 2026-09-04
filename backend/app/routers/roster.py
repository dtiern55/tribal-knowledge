from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg2 import errors as pg_errors

from app import database
from app.auth import get_current_user
from app.locking import EPISODE_LOCKED_SQL, latest_locked_episode, next_open_episode
from app.schemas import (
    RosterPick,
    RosterSubmitRequest,
    RosterSwapRequest,
    SoleSurvivorRequest,
)

router = APIRouter(tags=["roster"])


def _effective_swap_lock(ls) -> int | None:
    """The episode from which roster swaps are locked (#84): explicit
    swap_lock_episode, else three episodes past the merge (#163, widened
    2026-09-03). None until the merge is known. The finale is refused
    separately, regardless of this value."""
    if ls["swap_lock_episode"] is not None:
        return ls["swap_lock_episode"]
    if ls["merge_episode"] is not None:
        return ls["merge_episode"] + 3
    return None


def _effective_ss_lock(ls) -> int | None:
    """Sole Survivor designation locks with the swaps (2026-09-03): once your
    roster is final for the season, so is your pick of who wins on it. There
    is deliberately no separate knob, so the two can never drift apart."""
    return _effective_swap_lock(ls)


def _episode_locked(cur, season_id, episode_number) -> bool:
    cur.execute(
        f"""
        select 1 from episodes
        where season_id = %s and episode_number = %s and {EPISODE_LOCKED_SQL}
        """,
        [str(season_id), episode_number],
    )
    return cur.fetchone() is not None


def _ss_window_open_yet(cur, ls) -> bool:
    """Whether Sole Survivor designation has opened yet (#587).

    Designation opens at the merge — it's unavailable until the merge episode is
    the open one or later, so nobody crowns a winner while two tribes still
    stand. No merge set means not yet: the designation doubles a finale
    contribution, meaningless before the merge is known (#529)."""
    merge = ls["merge_episode"]
    if merge is None:
        return False
    nxt = next_open_episode(cur, ls)
    if nxt is not None:
        return nxt["episode_number"] >= merge
    # Nothing is open (an episode is airing, or play is over): fall back to how
    # far the season has locked, so a window that has since CLOSED past the
    # merge still reads as opened rather than not-yet.
    latest = latest_locked_episode(cur, ls["season_id"])
    return latest is not None and latest >= merge


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
                ss_lock = _effective_ss_lock(ls)
                if ss_lock is None or not _episode_locked(
                    cur, ls["season_id"], ss_lock
                ):
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
            # Guards the one-per-episode check and the penalty count below
            # against concurrent swaps.
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
            swap_lock = _effective_swap_lock(ls)
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
                "select id from eliminations where contestant_id = %s",
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

            # One swap per episode (#404). A swap closes the outgoing pick at
            # swap_episode - 1, so that is exactly what identifies "already
            # swapped this episode".
            cur.execute(
                "select 1 from roster_picks"
                " where user_id = %s and league_season_id = %s"
                " and active_until_episode = %s",
                [str(user_id), str(league_season_id), swap_episode - 1],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="You have already swapped this episode",
                )

            # Swaps are priced in points again (#403/#404) and no longer touch
            # the weekly play. The first free_swaps are free; after that the
            # Nth swap of the season costs step * N, floored. The cost is
            # written onto the pick being closed, so scoring attributes it to
            # the castaway you dropped. There is deliberately no exception for
            # dropping someone already voted out — that charge is the soft form
            # of "losing a castaway costs you".
            cur.execute(
                "select count(*) as n from roster_picks"
                " where user_id = %s and league_season_id = %s"
                " and active_until_episode is not null",
                [str(user_id), str(league_season_id)],
            )
            ordinal = cur.fetchone()["n"] + 1
            penalty = (
                0
                if ordinal <= ls["free_swaps"]
                # Both operands are <= 0, so max() applies the floor.
                else max(
                    ls["swap_penalty_step"] * ordinal,
                    ls["swap_penalty_floor"],
                )
            )

            cur.execute(
                """
                update roster_picks
                set active_until_episode = %s, swap_penalty_points = %s
                where id = %s
                """,
                [swap_episode - 1, penalty, str(old_pick["id"])],
            )

            cur.execute(
                """
                insert into roster_picks
                    (user_id, league_season_id, contestant_id, active_from_episode)
                values (%s, %s, %s, %s)
                returning *
                """,
                [
                    str(user_id),
                    str(league_season_id),
                    str(body.new_contestant_id),
                    swap_episode,
                ],
            )
            new_pick = cur.fetchone()

            return new_pick


@router.delete("/league-seasons/{league_season_id}/roster/swap", status_code=204)
def undo_roster_swap(
    league_season_id: UUID,
    user_id: UUID = Depends(get_current_user),
):
    """Undo this episode's swap while the episode is still open.

    Reverses the 2026-08-15 "non-refundable" rule: under the points economy a
    swap consumes nothing but a column value, and every other decision on the
    page stays editable until picks lock, so the swap did too (#403 follow-up).

    An exact reversal — the closed pick comes back as it was, penalty cleared,
    the incoming pick is removed, and the once-per-episode allowance is free
    again. Restoring the closed row also restores its Sole Survivor flag, if it
    held one.
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

            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and league_season_id = %s
                  and active_until_episode = %s
                """,
                [str(user_id), str(league_season_id), swap_episode - 1],
            )
            dropped = cur.fetchone()
            if not dropped:
                raise HTTPException(
                    status_code=400, detail="No swap to undo this episode"
                )

            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and league_season_id = %s
                  and active_from_episode = %s and active_until_episode is null
                """,
                [str(user_id), str(league_season_id), swap_episode],
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
                [str(dropped["id"])],
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

            ss_lock = _effective_ss_lock(ls)
            if ss_lock is None:
                raise HTTPException(
                    status_code=400,
                    detail="Sole survivor lock not configured for this season",
                )
            if not _ss_window_open_yet(cur, ls):
                raise HTTPException(
                    status_code=400,
                    detail="Sole Survivor designation opens at the merge",
                )
            if _episode_locked(cur, ls["season_id"], ss_lock):
                raise HTTPException(
                    status_code=400,
                    detail="Sole survivor designation window has closed",
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
                "select id from eliminations where contestant_id = %s",
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
            ss_lock = _effective_ss_lock(ls)
            if ss_lock is not None and _episode_locked(cur, ls["season_id"], ss_lock):
                raise HTTPException(
                    status_code=400,
                    detail="Sole survivor designation window has closed",
                )
            cur.execute(
                "update roster_picks set is_sole_survivor = false"
                " where user_id = %s and league_season_id = %s and is_sole_survivor",
                [str(user_id), str(league_season_id)],
            )
