from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_user
from app.locking import EPISODE_LOCKED_SQL, episode_locked
from app.schemas import FinalePrediction, FinalePredictionRequest

router = APIRouter(tags=["finale_predictions"])

# psycopg2 hands back a uuid[] column as the raw Postgres array string, so the
# array slates are cast to text[] to come back as real lists for the response
# model.
_COLS = (
    "id, user_id, season_id,"
    " final_four_contestant_ids::text[] as final_four_contestant_ids,"
    " final_three_contestant_ids::text[] as final_three_contestant_ids,"
    " winner_contestant_id, created_at"
)


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
            database.require_season(cur, season_id)

            # Other players' ballots stay hidden until the finale locks
            if str(user_id) != str(current_user):
                cur.execute(
                    f"""
                    select 1 from episodes
                    where season_id = %s and is_finale = true
                      and {EPISODE_LOCKED_SQL}
                    """,
                    [str(season_id)],
                )
                if not cur.fetchone():
                    raise HTTPException(
                        status_code=403,
                        detail="Finale predictions are hidden until they lock",
                    )
            cur.execute(
                f"select {_COLS} from finale_predictions"
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
            season = database.require_season(cur, season_id)

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

            if episode_locked(finale_ep):
                raise HTTPException(
                    status_code=400, detail="Finale prediction window has closed"
                )

            # Dedupe each slate, preserving order (a repeated name would double
            # a bracket seat). Every provided id is validated together below.
            def dedupe(seq):
                seen: dict[str, None] = {}
                for x in seq:
                    seen.setdefault(str(x), None)
                return list(seen)

            final_four = dedupe(body.final_four_contestant_ids)
            final_three = dedupe(body.final_three_contestant_ids)
            winner = (
                str(body.winner_contestant_id) if body.winner_contestant_id else None
            )

            # Validate every provided contestant id belongs to this season and
            # is alive AT the finale (#158): pre-finale boots are invalid, but
            # the finale episode's own eliminations are what the ballot predicts,
            # so they stay pickable even if results were entered early.
            ids = list({*final_four, *final_three, *([winner] if winner else [])})
            if ids:
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
                    """
                    select distinct e.contestant_id::text as id
                    from eliminations e
                    join episodes ep on ep.id = e.episode_id
                    where ep.season_id = %s and e.contestant_id::text = any(%s)
                      and ep.is_finale = false
                    """,
                    [str(season_id), ids],
                )
                gone = {row["id"] for row in cur.fetchall()}
                dead = [i for i in ids if i in gone]
                if dead:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Contestant(s) already eliminated: {dead}",
                    )

            cur.execute(
                """
                insert into finale_predictions
                    (user_id, season_id, final_four_contestant_ids,
                     final_three_contestant_ids, winner_contestant_id)
                values (%s, %s, %s::uuid[], %s::uuid[], %s)
                on conflict (user_id, season_id) do update set
                    final_four_contestant_ids  = excluded.final_four_contestant_ids,
                    final_three_contestant_ids = excluded.final_three_contestant_ids,
                    winner_contestant_id       = excluded.winner_contestant_id
                returning """ + _COLS,
                [
                    str(user_id),
                    str(season_id),
                    final_four,
                    final_three,
                    winner,
                ],
            )
            return cur.fetchone()
