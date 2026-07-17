from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg2 import errors as pg_errors

from app import database
from app.auth import get_current_user
from app.locking import EPISODE_LOCKED_SQL, next_open_episode
from app.schemas import RosterPick, RosterSubmitRequest, RosterSwapRequest

router = APIRouter(tags=["roster"])


@router.get("/seasons/{season_id}/roster/{user_id}", response_model=list[RosterPick])
def get_roster(
    season_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)

            # Other players' rosters stay hidden until the roster lock passes
            if str(user_id) != str(current_user):
                locked = False
                if season["roster_lock_episode"] is not None:
                    cur.execute(
                        f"""
                        select 1 from episodes
                        where season_id = %s and episode_number = %s
                          and {EPISODE_LOCKED_SQL}
                        """,
                        [str(season_id), season["roster_lock_episode"]],
                    )
                    locked = cur.fetchone() is not None
                if not locked:
                    raise HTTPException(
                        status_code=403,
                        detail="Rosters are hidden until they lock",
                    )
            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and season_id = %s
                order by active_from_episode, contestant_id
                """,
                [str(user_id), str(season_id)],
            )
            return cur.fetchall()


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

            cur.execute(
                "select id from roster_picks"
                " where user_id = %s and season_id = %s limit 1",
                [str(user_id), str(season_id)],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409, detail="Roster already submitted for this season"
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

            cur.execute(
                "select id from contestants where id = %s and season_id = %s",
                [str(body.new_contestant_id), str(season_id)],
            )
            if not cur.fetchone():
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

            cur.execute(
                """
                update roster_picks
                set active_until_episode = %s, swap_penalty_points = %s
                where id = %s
                """,
                [swap_episode - 1, season["swap_penalty_points"], str(old_pick["id"])],
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
            return cur.fetchone()
