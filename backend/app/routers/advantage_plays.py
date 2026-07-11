from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg2 import errors as pg_errors

from app import database
from app.auth import get_current_user
from app.locking import EPISODE_LOCKED_SQL, next_open_episode
from app.schemas import AdvantagePlay, AdvantagePlayRequest, AdvantageType

router = APIRouter(tags=["advantage_plays"])

# Advantages that double a named contestant's points for the episode they're
# played in; extra_vote raises the pick limit instead and takes no target.
_DOUBLE_TYPES = {"double_roster_points", "double_vote_points"}


@router.get("/advantage-types", response_model=list[AdvantageType])
def list_advantage_types(_: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select * from advantage_types where enabled = true order by token_cost"
            )
            return cur.fetchall()


@router.get(
    "/seasons/{season_id}/advantage-plays/{user_id}",
    response_model=list[AdvantagePlay],
)
def list_user_advantage_plays(
    season_id: UUID, user_id: UUID, current_user: UUID = Depends(get_current_user)
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            # Other players' plays stay hidden until the episode they affect locks
            cur.execute(
                f"""
                select ap.* from advantage_plays ap
                join episodes ep on ep.id = ap.episode_id
                where ep.season_id = %s and ap.user_id = %s
                  and (ap.user_id = %s or {EPISODE_LOCKED_SQL})
                order by ap.created_at
                """,
                [str(season_id), str(user_id), str(current_user)],
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
    user_id: UUID = Depends(get_current_user),
):
    """Self-serve: a player spends tokens to play an advantage in the next
    open episode (decision #12, 2026-07-06). Steal a Vote and Immunity Idol
    were dropped as PvP mechanics that weren't fun; only three remain.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)

            cur.execute(
                "select token_cost from advantage_types"
                " where advantage_type = %s and enabled = true",
                [body.advantage_type],
            )
            advantage = cur.fetchone()
            if not advantage:
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown advantage type: {body.advantage_type}",
                )
            cost = advantage["token_cost"]

            episode = next_open_episode(cur, str(season_id))
            if not episode:
                raise HTTPException(
                    status_code=400, detail="No open episode to play this advantage in"
                )

            if body.advantage_type in _DOUBLE_TYPES:
                if body.target_contestant_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{body.advantage_type} requires a target_contestant_id",
                    )
                if body.advantage_type == "double_roster_points":
                    cur.execute(
                        """
                        select 1 from roster_picks
                        where user_id = %s and season_id = %s and contestant_id = %s
                          and active_until_episode is null
                        """,
                        [str(user_id), str(season_id), str(body.target_contestant_id)],
                    )
                    if not cur.fetchone():
                        raise HTTPException(
                            status_code=400,
                            detail="Target contestant is not on your active roster",
                        )
                else:
                    cur.execute(
                        "select 1 from contestants where id = %s and season_id = %s",
                        [str(body.target_contestant_id), str(season_id)],
                    )
                    if not cur.fetchone():
                        raise HTTPException(
                            status_code=400,
                            detail="Target contestant not in this season",
                        )
            elif body.target_contestant_id is not None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{body.advantage_type} does not take a target_contestant_id"
                    ),
                )

            cur.execute(
                """
                select coalesce(sum(amount), 0) as balance
                from token_transactions
                where user_id = %s and season_id = %s
                """,
                [str(user_id), str(season_id)],
            )
            balance = cur.fetchone()["balance"]
            if balance < cost:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient tokens: balance {balance}, cost {cost}",
                )

            try:
                cur.execute(
                    """
                    insert into advantage_plays
                        (user_id, episode_id, advantage_type,
                         target_contestant_id, token_cost)
                    values (%s, %s, %s, %s, %s)
                    returning *
                    """,
                    [
                        str(user_id),
                        episode["id"],
                        body.advantage_type,
                        (
                            str(body.target_contestant_id)
                            if body.target_contestant_id
                            else None
                        ),
                        cost,
                    ],
                )
            except pg_errors.UniqueViolation:
                raise HTTPException(
                    status_code=409,
                    detail=f"{body.advantage_type} already played for this episode",
                )
            play = cur.fetchone()

            if cost > 0:
                cur.execute(
                    """
                    insert into token_transactions
                        (user_id, season_id, episode_id, transaction_type,
                         amount, advantage_play_id)
                    values (%s, %s, %s, 'advantage_spend', %s, %s)
                    """,
                    [str(user_id), str(season_id), episode["id"], -cost, play["id"]],
                )

            return play
