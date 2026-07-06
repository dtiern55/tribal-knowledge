from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_user
from app.schemas import WinnerPick, WinnerPickSubmitRequest

router = APIRouter(tags=["winner_picks"])


@router.get("/seasons/{season_id}/winner-picks/{user_id}", response_model=WinnerPick)
def get_winner_pick(season_id: UUID, user_id: UUID):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")
            cur.execute(
                """
                select * from winner_picks
                where season_id = %s and user_id = %s
                order by effective_episode desc, created_at desc
                limit 1
                """,
                [str(season_id), str(user_id)],
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Winner pick not found")
            return row


@router.post(
    "/seasons/{season_id}/winner-picks",
    response_model=WinnerPick,
    status_code=201,
)
def submit_winner_pick(
    season_id: UUID,
    body: WinnerPickSubmitRequest,
    user_id: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select status, merge_episode from seasons where id = %s",
                [str(season_id)],
            )
            season = cur.fetchone()
            if not season:
                raise HTTPException(status_code=404, detail="Season not found")

            if season["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            if season["merge_episode"] is None:
                raise HTTPException(
                    status_code=400, detail="Merge episode not set for this season"
                )

            cur.execute(
                """
                select picks_lock_at, status from episodes
                where season_id = %s and episode_number = %s
                """,
                [str(season_id), season["merge_episode"]],
            )
            merge_ep = cur.fetchone()
            if not merge_ep:
                raise HTTPException(
                    status_code=400, detail="Merge episode not yet scheduled"
                )

            if (
                merge_ep["picks_lock_at"] <= datetime.now(timezone.utc)
                or merge_ep["status"] == "scored"
            ):
                raise HTTPException(
                    status_code=400, detail="Winner pick window has closed"
                )

            if body.winner_contestant_id == body.backup_contestant_id:
                raise HTTPException(
                    status_code=400,
                    detail="Winner and backup must be different contestants",
                )

            ids = [str(body.winner_contestant_id), str(body.backup_contestant_id)]
            cur.execute(
                "select id::text as id from contestants"
                " where season_id = %s and id::text = any(%s)",
                [str(season_id), ids],
            )
            valid = {row["id"] for row in cur.fetchall()}
            invalid = [i for i in ids if i not in valid]
            if invalid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Contestants not in this season: {invalid}",
                )

            cur.execute(
                "select id from winner_picks"
                " where user_id = %s and season_id = %s limit 1",
                [str(user_id), str(season_id)],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="Winner pick already submitted; changes require tokens",
                )

            cur.execute(
                """
                insert into winner_picks
                    (user_id, season_id, winner_contestant_id,
                     backup_contestant_id, effective_episode)
                values (%s, %s, %s, %s, 1)
                returning *
                """,
                [
                    str(user_id),
                    str(season_id),
                    str(body.winner_contestant_id),
                    str(body.backup_contestant_id),
                ],
            )
            return cur.fetchone()
