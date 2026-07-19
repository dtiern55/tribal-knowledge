from uuid import UUID

from fastapi import APIRouter, Depends

from app import database
from app.auth import get_current_user
from app.schemas import RulesResponse

router = APIRouter(tags=["rules"])


@router.get("/seasons/{season_id}/rules", response_model=RulesResponse)
def get_rules(season_id: UUID, _: UUID = Depends(get_current_user)):
    """Everything a Rules page needs, straight from the config tables so it
    stays in sync with actual scoring (issue #95): the season's structural
    rules plus scoring-event, prediction and advantage values.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            # Season snapshot, not the globals (#170): the Rules page shows
            # the values THIS season actually scores with, forever.
            cur.execute(
                "select event_type, label, point_value, postmerge_point_value,"
                " token_value, is_per_unit from season_scoring_event_types"
                " where season_id = %s"
                " order by point_value desc, token_value desc, label",
                [str(season_id)],
            )
            scoring_events = cur.fetchall()
            cur.execute(
                "select key, label, point_value, postmerge_point_value"
                " from season_prediction_score_types where season_id = %s"
                " order by point_value desc",
                [str(season_id)],
            )
            prediction_scores = cur.fetchall()
            cur.execute(
                "select advantage_type, label, token_cost, enabled"
                " from advantage_types where enabled = true order by token_cost"
            )
            advantages = cur.fetchall()
    return {
        "season": season,
        "scoring_events": scoring_events,
        "prediction_scores": prediction_scores,
        "advantages": advantages,
    }
