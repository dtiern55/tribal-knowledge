from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_user
from app.schemas import FinalePrediction, FinalePredictionRequest

router = APIRouter(tags=["finale_predictions"])


@router.get(
    "/seasons/{season_id}/finale-predictions/{user_id}",
    response_model=FinalePrediction,
)
def get_finale_prediction(
    season_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")

            # Other players' ballots stay hidden until the finale locks
            if str(user_id) != str(current_user):
                cur.execute(
                    """
                    select 1 from episodes
                    where season_id = %s and is_finale = true
                      and (picks_lock_at <= now() or status = 'scored')
                    """,
                    [str(season_id)],
                )
                if not cur.fetchone():
                    raise HTTPException(
                        status_code=403,
                        detail="Finale predictions are hidden until they lock",
                    )
            cur.execute(
                "select * from finale_predictions"
                " where season_id = %s and user_id = %s",
                [str(season_id), str(user_id)],
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Prediction not found")
            return row


@router.post(
    "/seasons/{season_id}/finale-predictions",
    response_model=FinalePrediction,
)
def submit_finale_prediction(
    season_id: UUID,
    body: FinalePredictionRequest,
    user_id: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select status from seasons where id = %s", [str(season_id)])
            season = cur.fetchone()
            if not season:
                raise HTTPException(status_code=404, detail="Season not found")

            if season["status"] == "completed":
                raise HTTPException(status_code=400, detail="Season is complete")

            cur.execute(
                "select picks_lock_at, status from episodes"
                " where season_id = %s and is_finale = true",
                [str(season_id)],
            )
            finale_ep = cur.fetchone()
            if not finale_ep:
                raise HTTPException(
                    status_code=400, detail="Finale episode not yet scheduled"
                )

            if (
                finale_ep["picks_lock_at"] <= datetime.now(timezone.utc)
                or finale_ep["status"] == "scored"
            ):
                raise HTTPException(
                    status_code=400, detail="Finale prediction window has closed"
                )

            # Validate all provided contestant IDs belong to this season
            provided = {
                k: v
                for k, v in {
                    "early_boot": body.early_boot_contestant_id,
                    "fire_loss": body.fire_loss_contestant_id,
                    "winner": body.winner_contestant_id,
                }.items()
                if v is not None
            }
            if provided:
                ids = list({str(v) for v in provided.values()})
                cur.execute(
                    "select id::text as id from contestants"
                    " where season_id = %s and id::text = any(%s)",
                    [str(season_id), ids],
                )
                valid = {row["id"] for row in cur.fetchall()}
                invalid = [str(v) for v in provided.values() if str(v) not in valid]
                if invalid:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Contestants not in this season: {invalid}",
                    )

            cur.execute(
                """
                insert into finale_predictions
                    (user_id, season_id, early_boot_contestant_id,
                     fire_loss_contestant_id, winner_contestant_id)
                values (%s, %s, %s, %s, %s)
                on conflict (user_id, season_id) do update set
                    early_boot_contestant_id = excluded.early_boot_contestant_id,
                    fire_loss_contestant_id  = excluded.fire_loss_contestant_id,
                    winner_contestant_id     = excluded.winner_contestant_id
                returning *
                """,
                [
                    str(user_id),
                    str(season_id),
                    (
                        str(body.early_boot_contestant_id)
                        if body.early_boot_contestant_id
                        else None
                    ),
                    (
                        str(body.fire_loss_contestant_id)
                        if body.fire_loss_contestant_id
                        else None
                    ),
                    (
                        str(body.winner_contestant_id)
                        if body.winner_contestant_id
                        else None
                    ),
                ],
            )
            return cur.fetchone()
