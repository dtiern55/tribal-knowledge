from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg2 import errors as pg_errors

from app import database, scoring
from app.auth import get_current_user
from app.locking import episode_locked, next_open_episode
from app.schemas import (
    AdvantageBuyRequest,
    AdvantagePlay,
    AdvantageType,
    AdvantageUseRequest,
)

router = APIRouter(tags=["advantage_plays"])

# Advantages that double a named contestant's points for the episode they're
# used in; extra_vote raises the pick limit instead and takes no target.
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
    """Own rows: everything, including unused inventory. Other players:
    only used advantages whose episode has locked — unused inventory is
    private strategy, like unlocked picks.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            if str(user_id) == str(current_user):
                cur.execute(
                    """
                    select * from advantage_plays
                    where season_id = %s and user_id = %s
                    order by created_at
                    """,
                    [str(season_id), str(user_id)],
                )
            else:
                cur.execute(
                    """
                    select ap.* from advantage_plays ap
                    join episodes ep on ep.id = ap.episode_id
                    where ap.season_id = %s and ap.user_id = %s
                      and (ep.picks_lock_at <= now() or ep.status = 'scored')
                    order by ap.created_at
                    """,
                    [str(season_id), str(user_id)],
                )
            plays = cur.fetchall()

        # Attach the bonus points each played double actually earned (#85).
        bonus = scoring.advantage_bonus_by_play(conn, season_id, user_id)
        for play in plays:
            play["points_earned"] = bonus.get(str(play["id"]))
        return plays


@router.post(
    "/seasons/{season_id}/advantage-plays",
    response_model=AdvantagePlay,
    status_code=201,
)
def buy_advantage(
    season_id: UUID,
    body: AdvantageBuyRequest,
    user_id: UUID = Depends(get_current_user),
):
    """Buy an advantage into inventory (issue #47, buy → hold → use).

    Tokens are spent here, once and finally. The advantage binds to an
    episode (and target) later, via the use endpoint. Stockpiling multiple
    unused copies of the same type is allowed.
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

            cur.execute(
                """
                insert into advantage_plays
                    (user_id, season_id, advantage_type, token_cost)
                values (%s, %s, %s, %s)
                returning *
                """,
                [str(user_id), str(season_id), body.advantage_type, cost],
            )
            play = cur.fetchone()

            if cost > 0:
                cur.execute(
                    """
                    insert into token_transactions
                        (user_id, season_id, transaction_type,
                         amount, advantage_play_id)
                    values (%s, %s, 'advantage_spend', %s, %s)
                    """,
                    [str(user_id), str(season_id), -cost, play["id"]],
                )

            return play


def _get_own_play(cur, play_id: UUID, user_id: UUID) -> dict:
    cur.execute("select * from advantage_plays where id = %s", [str(play_id)])
    play = cur.fetchone()
    # 404 for other players' plays too: don't leak what they own
    if not play or str(play["user_id"]) != str(user_id):
        raise HTTPException(status_code=404, detail="Advantage not found")
    return play


@router.post("/advantage-plays/{play_id}/use", response_model=AdvantagePlay)
def use_advantage(
    play_id: UUID,
    body: AdvantageUseRequest,
    user_id: UUID = Depends(get_current_user),
):
    """Bind an owned advantage to the currently-open episode. Reversible
    until that episode locks (see unuse_advantage).
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            play = _get_own_play(cur, play_id, user_id)
            if play["episode_id"] is not None:
                raise HTTPException(status_code=409, detail="Advantage already in play")

            episode = next_open_episode(cur, play["season_id"])
            if not episode:
                raise HTTPException(
                    status_code=400, detail="No open episode to use this advantage in"
                )
            # Advantages can't be played in the finale (issue #85).
            if episode["is_finale"]:
                raise HTTPException(
                    status_code=400,
                    detail="Advantages can't be played in the finale",
                )

            if play["advantage_type"] in _DOUBLE_TYPES:
                if body.target_contestant_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"{play['advantage_type']} requires a"
                            " target_contestant_id"
                        ),
                    )
                if play["advantage_type"] == "double_roster_points":
                    cur.execute(
                        """
                        select 1 from roster_picks
                        where user_id = %s and season_id = %s and contestant_id = %s
                          and active_until_episode is null
                        """,
                        [
                            str(user_id),
                            play["season_id"],
                            str(body.target_contestant_id),
                        ],
                    )
                    if not cur.fetchone():
                        raise HTTPException(
                            status_code=400,
                            detail="Target contestant is not on your active roster",
                        )
                else:
                    cur.execute(
                        "select 1 from contestants where id = %s and season_id = %s",
                        [str(body.target_contestant_id), play["season_id"]],
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
                        f"{play['advantage_type']} does not take a"
                        " target_contestant_id"
                    ),
                )

            try:
                cur.execute(
                    """
                    update advantage_plays
                    set episode_id = %s, target_contestant_id = %s
                    where id = %s
                    returning *
                    """,
                    [
                        episode["id"],
                        (
                            str(body.target_contestant_id)
                            if body.target_contestant_id
                            else None
                        ),
                        str(play_id),
                    ],
                )
            except pg_errors.UniqueViolation:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"{play['advantage_type']} is already in play on that"
                        " target this episode"
                    ),
                )
            return cur.fetchone()


@router.delete("/advantage-plays/{play_id}/use", response_model=AdvantagePlay)
def unuse_advantage(play_id: UUID, user_id: UUID = Depends(get_current_user)):
    """Take a used advantage back into inventory while its episode is still
    open. No token movement — tokens were spent at purchase.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            play = _get_own_play(cur, play_id, user_id)
            if play["episode_id"] is None:
                raise HTTPException(status_code=400, detail="Advantage is not in play")

            cur.execute("select * from episodes where id = %s", [play["episode_id"]])
            episode = cur.fetchone()
            if episode_locked(episode):
                raise HTTPException(
                    status_code=400,
                    detail="Episode has locked; the advantage is spent",
                )

            if play["advantage_type"] == "extra_vote":
                # Taking back an extra vote must not strand an over-limit
                # pick set (decision on #47): drop a pick first.
                cur.execute(
                    """
                    select count(*) as n from elimination_picks
                    where user_id = %s and episode_id = %s
                    """,
                    [str(user_id), play["episode_id"]],
                )
                picks_n = cur.fetchone()["n"]
                cur.execute(
                    """
                    select count(*) as n from advantage_plays
                    where user_id = %s and episode_id = %s
                      and advantage_type = 'extra_vote'
                    """,
                    [str(user_id), play["episode_id"]],
                )
                limit_after = episode["max_elimination_picks"] + cur.fetchone()["n"] - 1
                if picks_n > limit_after:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Drop an elimination pick first: taking back the"
                            f" extra vote leaves {picks_n} picks but a limit"
                            f" of {limit_after}"
                        ),
                    )

            cur.execute(
                """
                update advantage_plays
                set episode_id = null, target_contestant_id = null
                where id = %s
                returning *
                """,
                [str(play_id)],
            )
            return cur.fetchone()
