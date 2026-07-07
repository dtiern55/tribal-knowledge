from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin, get_current_user
from app.schemas import AdvantagePlay, AdvantagePlayRequest

router = APIRouter(tags=["advantage_plays"])

_VALID_TYPES = {
    "double_roster_points",
    "double_vote_points",
    "extra_vote",
    "swap_a_pick",
    "change_backup_pick",
    "change_winner_pick",
    "steal_a_vote",
    "immunity_idol",
}


@router.get("/seasons/{season_id}/advantage-plays", response_model=list[AdvantagePlay])
def list_advantage_plays(season_id: UUID, _: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")
            cur.execute(
                """
                select ap.* from advantage_plays ap
                join episodes ep on ep.id = ap.episode_id
                where ep.season_id = %s
                order by ap.created_at
                """,
                [str(season_id)],
            )
            return cur.fetchall()


@router.get(
    "/seasons/{season_id}/advantage-plays/{user_id}",
    response_model=list[AdvantagePlay],
)
def list_user_advantage_plays(
    season_id: UUID, user_id: UUID, _: UUID = Depends(get_current_user)
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")
            cur.execute(
                """
                select ap.* from advantage_plays ap
                join episodes ep on ep.id = ap.episode_id
                where ep.season_id = %s and ap.user_id = %s
                order by ap.created_at
                """,
                [str(season_id), str(user_id)],
            )
            return cur.fetchall()


@router.post(
    "/seasons/{season_id}/advantage-plays",
    response_model=AdvantagePlay,
    status_code=201,
)
def record_advantage_play(
    season_id: UUID,
    body: AdvantagePlayRequest,
    _: UUID = Depends(get_current_admin),
):
    if body.advantage_type not in _VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown advantage type: {body.advantage_type}",
        )

    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id from episodes where id = %s and season_id = %s",
                [str(body.episode_id), str(season_id)],
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Episode not found")

            cur.execute("select id from profiles where id = %s", [str(body.user_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="User not found")

            if body.target_user_id is not None:
                cur.execute(
                    "select id from profiles where id = %s",
                    [str(body.target_user_id)],
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Target user not found")

            if body.target_contestant_id is not None:
                cur.execute(
                    "select id from contestants where id = %s and season_id = %s",
                    [str(body.target_contestant_id), str(season_id)],
                )
                if not cur.fetchone():
                    raise HTTPException(
                        status_code=404, detail="Target contestant not found"
                    )

            if body.episode_affected_id is not None:
                cur.execute(
                    "select id from episodes where id = %s and season_id = %s",
                    [str(body.episode_affected_id), str(season_id)],
                )
                if not cur.fetchone():
                    raise HTTPException(
                        status_code=404, detail="Affected episode not found"
                    )

            # Negative balances are never allowed (decision 2026-07-06, #39)
            if body.token_cost > 0:
                cur.execute(
                    """
                    select coalesce(sum(amount), 0) as balance
                    from token_transactions
                    where user_id = %s and season_id = %s
                    """,
                    [str(body.user_id), str(season_id)],
                )
                balance = cur.fetchone()["balance"]
                if balance < body.token_cost:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Insufficient tokens: balance {balance},"
                            f" cost {body.token_cost}"
                        ),
                    )

            cur.execute(
                """
                insert into advantage_plays
                    (user_id, episode_id, advantage_type, target_user_id,
                     target_contestant_id, episode_affected_id, token_cost)
                values (%s, %s, %s, %s, %s, %s, %s)
                returning *
                """,
                [
                    str(body.user_id),
                    str(body.episode_id),
                    body.advantage_type,
                    str(body.target_user_id) if body.target_user_id else None,
                    (
                        str(body.target_contestant_id)
                        if body.target_contestant_id
                        else None
                    ),
                    str(body.episode_affected_id) if body.episode_affected_id else None,
                    body.token_cost,
                ],
            )
            play = cur.fetchone()

            if body.token_cost > 0:
                cur.execute(
                    """
                    insert into token_transactions
                        (user_id, season_id, episode_id, transaction_type,
                         amount, advantage_play_id)
                    values (%s, %s, %s, 'advantage_spend', %s, %s)
                    """,
                    [
                        str(body.user_id),
                        str(season_id),
                        str(body.episode_id),
                        -body.token_cost,
                        str(play["id"]),
                    ],
                )

            return play
