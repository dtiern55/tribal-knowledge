from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_user
from app.locking import EPISODE_LOCKED_SQL
from app.schemas import WinnerPick, WinnerPickSubmitRequest

router = APIRouter(tags=["winner_picks"])


@router.get("/seasons/{season_id}/winner-picks/{user_id}", response_model=WinnerPick)
def get_winner_pick(
    season_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)

            # Other players' winner picks stay hidden until the lock episode locks
            if str(user_id) != str(current_user):
                locked = False
                if season["winner_lock_episode"] is not None:
                    cur.execute(
                        f"""
                        select 1 from episodes
                        where season_id = %s and episode_number = %s
                          and {EPISODE_LOCKED_SQL}
                        """,
                        [str(season_id), season["winner_lock_episode"]],
                    )
                    locked = cur.fetchone() is not None
                if not locked:
                    raise HTTPException(
                        status_code=403,
                        detail="Winner picks are hidden until they lock",
                    )

            cur.execute(
                "select * from winner_picks where season_id = %s and user_id = %s",
                [str(season_id), str(user_id)],
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Winner pick not found")
            return row


@router.post("/seasons/{season_id}/winner-picks", response_model=WinnerPick)
def submit_winner_pick(
    season_id: UUID,
    body: WinnerPickSubmitRequest,
    user_id: UUID = Depends(get_current_user),
):
    """Create or update the caller's winner pick. Free and editable until the
    season's winner_lock_episode locks (decision #12, 2026-07-06) — there is
    no backup pick and no paid change mechanic.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)

            if season["winner_mode"] != "classic":
                raise HTTPException(
                    status_code=400,
                    detail="This season designates a Sole Survivor instead",
                )

            if season["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            if season["winner_lock_episode"] is None:
                raise HTTPException(
                    status_code=400,
                    detail="Winner lock episode not set for this season",
                )

            cur.execute(
                f"""
                select id from episodes
                where season_id = %s and episode_number = %s
                  and {EPISODE_LOCKED_SQL}
                """,
                [str(season_id), season["winner_lock_episode"]],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=400, detail="Winner pick window has closed"
                )

            cur.execute(
                "select 1 from contestants where season_id = %s and id = %s",
                [str(season_id), str(body.winner_contestant_id)],
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="Contestant not in this season",
                )

            cur.execute(
                """
                insert into winner_picks (user_id, season_id, winner_contestant_id)
                values (%s, %s, %s)
                on conflict (user_id, season_id)
                do update set winner_contestant_id = excluded.winner_contestant_id
                returning *
                """,
                [str(user_id), str(season_id), str(body.winner_contestant_id)],
            )
            return cur.fetchone()
