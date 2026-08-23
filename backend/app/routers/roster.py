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


def _effective_ss_lock(cur, season) -> int | None:
    """The episode from which sole-survivor designation is locked (#164;
    retimed 2026-07-19): explicit ss_lock_episode, else the advantage lock,
    else the finale — designation stays open later than swaps, closing with
    the rest of the advantage economy."""
    if season["ss_lock_episode"] is not None:
        return season["ss_lock_episode"]
    if season["advantage_lock_episode"] is not None:
        return season["advantage_lock_episode"]
    cur.execute(
        "select episode_number from episodes"
        " where season_id = %s and is_finale = true limit 1",
        [str(season["id"])],
    )
    row = cur.fetchone()
    return row["episode_number"] if row else None


def _episode_locked(cur, season_id, episode_number) -> bool:
    cur.execute(
        f"""
        select 1 from episodes
        where season_id = %s and episode_number = %s and {EPISODE_LOCKED_SQL}
        """,
        [str(season_id), episode_number],
    )
    return cur.fetchone() is not None


@router.get("/seasons/{season_id}/roster/{user_id}", response_model=list[RosterPick])
def get_roster(
    season_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            database.require_roster_visible(cur, season, user_id, current_user)
            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and season_id = %s
                order by active_from_episode, contestant_id
                """,
                [str(user_id), str(season_id)],
            )
            rows = cur.fetchall()

            if str(user_id) != str(current_user):
                # A swap into the still-open episode is undoable strategy, so
                # bound another player's roster to the latest LOCKED episode:
                # a pending swap-in (active_from in an unlocked episode) stays
                # hidden until that episode locks, and the pick it replaces
                # stays shown until then (#164 follow-up).
                locked_through = latest_locked_episode(cur, season_id)
                rows = [
                    r
                    for r in rows
                    if locked_through is not None
                    and r["active_from_episode"] <= locked_through
                    and (
                        r["active_until_episode"] is None
                        or r["active_until_episode"] >= locked_through
                    )
                ]
                # Another player's designation is strategy until it locks (#164):
                # the roster may already be visible, the flag is not.
                ss_lock = _effective_ss_lock(cur, season)
                if ss_lock is None or not _episode_locked(cur, season_id, ss_lock):
                    for r in rows:
                        r["is_sole_survivor"] = False
            return rows


@router.post("/seasons/{season_id}/roster", response_model=list[RosterPick])
def submit_roster(
    season_id: UUID,
    body: RosterSubmitRequest,
    user_id: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)

            if season["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            if season["roster_lock_episode"] is None:
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
                [str(season_id), season["roster_lock_episode"]],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="Roster submission window has closed",
                )

            if len(body.contestant_ids) != season["roster_size"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Expected {season['roster_size']} contestants,"
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
                "delete from roster_picks where user_id = %s and season_id = %s",
                [str(user_id), str(season_id)],
            )

            ids = [str(c) for c in body.contestant_ids]
            cur.execute(
                "select id::text as id from contestants"
                " where season_id = %s and id::text = any(%s)",
                [str(season_id), ids],
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
                            (user_id, season_id, contestant_id, active_from_episode)
                        values (%s, %s, %s, %s)
                        returning *
                        """,
                        [
                            str(user_id),
                            str(season_id),
                            str(cid),
                            season["roster_lock_episode"],
                        ],
                    )
                    rows.append(cur.fetchone())
            except pg_errors.UniqueViolation:
                # Concurrent double-submit raced past the check above
                raise HTTPException(
                    status_code=409, detail="Roster already submitted for this season"
                )
            return rows


@router.post("/seasons/{season_id}/roster/swap", response_model=RosterPick)
def swap_roster_pick(
    season_id: UUID,
    body: RosterSwapRequest,
    user_id: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            # Guards the one-per-episode check and the penalty count below
            # against concurrent swaps.
            database.lock_user_season(cur, user_id, season_id)

            if season["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            # Swaps take effect immediately, from the next open episode (#9).
            episode = next_open_episode(cur, str(season_id))
            if not episode:
                raise HTTPException(
                    status_code=400, detail="No open episode to swap into"
                )

            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and season_id = %s
                  and contestant_id = %s and active_until_episode is null
                """,
                [str(user_id), str(season_id), str(body.old_contestant_id)],
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

            # Swaps lock late-game (issue #84). An unset lock falls back to
            # two episodes past the merge (#163) so a fresh season can never
            # swap a finalist in at final tribal; the finale itself is always
            # off-limits.
            swap_lock = season["swap_lock_episode"]
            if swap_lock is None and season["merge_episode"] is not None:
                swap_lock = season["merge_episode"] + 2
            if episode["is_finale"] or (
                swap_lock is not None and swap_episode >= swap_lock
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Roster swaps are locked for the rest of the season",
                )

            cur.execute(
                "select id, name from contestants where id = %s and season_id = %s",
                [str(body.new_contestant_id), str(season_id)],
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
                " where user_id = %s and season_id = %s and contestant_id = %s",
                [str(user_id), str(season_id), str(body.new_contestant_id)],
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
                " where user_id = %s and season_id = %s"
                " and active_until_episode = %s",
                [str(user_id), str(season_id), swap_episode - 1],
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
                " where user_id = %s and season_id = %s"
                " and active_until_episode is not null",
                [str(user_id), str(season_id)],
            )
            ordinal = cur.fetchone()["n"] + 1
            penalty = (
                0
                if ordinal <= season["free_swaps"]
                # Both operands are <= 0, so max() applies the floor.
                else max(
                    season["swap_penalty_step"] * ordinal,
                    season["swap_penalty_floor"],
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
                    (user_id, season_id, contestant_id, active_from_episode)
                values (%s, %s, %s, %s)
                returning *
                """,
                [
                    str(user_id),
                    str(season_id),
                    str(body.new_contestant_id),
                    swap_episode,
                ],
            )
            new_pick = cur.fetchone()

            return new_pick


@router.delete("/seasons/{season_id}/roster/swap", status_code=204)
def undo_roster_swap(
    season_id: UUID,
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
            season = database.require_season(cur, season_id)
            # Serializes against a concurrent swap in the same episode.
            database.lock_user_season(cur, user_id, season_id)

            if season["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            # Only the open episode's swap is reversible; next_open_episode
            # already excludes anything past its picks_lock_at.
            episode = next_open_episode(cur, str(season_id))
            if not episode:
                raise HTTPException(
                    status_code=400, detail="Episode has locked; the swap is final"
                )
            swap_episode = episode["episode_number"]

            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and season_id = %s and active_until_episode = %s
                """,
                [str(user_id), str(season_id), swap_episode - 1],
            )
            dropped = cur.fetchone()
            if not dropped:
                raise HTTPException(
                    status_code=400, detail="No swap to undo this episode"
                )

            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and season_id = %s
                  and active_from_episode = %s and active_until_episode is null
                """,
                [str(user_id), str(season_id), swap_episode],
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


@router.post("/seasons/{season_id}/sole-survivor", response_model=RosterPick)
def designate_sole_survivor(
    season_id: UUID,
    body: SoleSurvivorRequest,
    user_id: UUID = Depends(get_current_user),
):
    """Designate one active-roster contestant as your Sole Survivor (#164).

    Free and editable until the designation locks; their finale-episode
    contribution to your roster score is doubled.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            if season["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            ss_lock = _effective_ss_lock(cur, season)
            if ss_lock is None:
                raise HTTPException(
                    status_code=400,
                    detail="Sole survivor lock not configured for this season",
                )
            if _episode_locked(cur, season_id, ss_lock):
                raise HTTPException(
                    status_code=400,
                    detail="Sole survivor designation window has closed",
                )

            cur.execute(
                """
                select id from roster_picks
                where user_id = %s and season_id = %s and contestant_id = %s
                  and active_until_episode is null
                """,
                [str(user_id), str(season_id), str(body.contestant_id)],
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
                " where user_id = %s and season_id = %s and is_sole_survivor",
                [str(user_id), str(season_id)],
            )
            cur.execute(
                "update roster_picks set is_sole_survivor = true"
                " where id = %s returning *",
                [str(pick["id"])],
            )
            return cur.fetchone()


@router.delete("/seasons/{season_id}/sole-survivor", status_code=204)
def clear_sole_survivor(season_id: UUID, user_id: UUID = Depends(get_current_user)):
    """Clear your Sole Survivor designation (the Undo, #164). Only while the
    designation window is open, same as designating."""
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            if season["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")
            ss_lock = _effective_ss_lock(cur, season)
            if ss_lock is not None and _episode_locked(cur, season_id, ss_lock):
                raise HTTPException(
                    status_code=400,
                    detail="Sole survivor designation window has closed",
                )
            cur.execute(
                "update roster_picks set is_sole_survivor = false"
                " where user_id = %s and season_id = %s and is_sole_survivor",
                [str(user_id), str(season_id)],
            )
