from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database, scoring
from app.auth import get_current_user
from app.locking import (
    advantages_locked,
    episode_locked,
    next_open_episode,
    used_weekly_play,
)
from app.schemas import AdvantagePlay, AdvantagePlayRequest, AdvantageType

router = APIRouter(tags=["advantage_plays"])

# The only advantage that names a target. double_vote_points covers the whole
# ballot (#303) and extra_vote raises the pick limit — neither takes one.
_TARGETED_TYPES = {"double_roster_points"}


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
def play_advantage(
    season_id: UUID,
    body: AdvantagePlayRequest,
    user_id: UUID = Depends(get_current_user),
):
    """Spend this episode's advantage play (#307).

    Every player gets exactly one play per episode — no buying, no inventory,
    no balance. It always lands on the currently-open episode, and it is
    reversible until that episode locks (see take_back_advantage).

    The one-play rule is enforced here rather than by a unique constraint:
    64 user-episodes in the practice seasons already hold multiple plays from
    the token era, so the index could never be created. The advisory lock
    below makes the count-then-insert safe.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            # Serializes the one-play check below against a concurrent play.
            database.lock_user_season(cur, user_id, season_id)

            episode = next_open_episode(cur, str(season_id))
            if episode is None:
                raise HTTPException(
                    status_code=400,
                    detail="No open episode to play an advantage in",
                )

            cur.execute(
                "select advantage_lock_episode from seasons where id = %s",
                [str(season_id)],
            )
            adv_lock = cur.fetchone()["advantage_lock_episode"]
            if advantages_locked(
                episode["episode_number"], episode["is_finale"], adv_lock
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Advantages can no longer be played this season",
                )

            cur.execute(
                "select token_cost from advantage_types"
                " where advantage_type = %s and enabled = true",
                [body.advantage_type],
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail=f"Unknown advantage type: {body.advantage_type}",
                )

            if used_weekly_play(cur, user_id, episode["id"]):
                raise HTTPException(
                    status_code=409,
                    detail="You have already used your advantage this episode",
                )

            if body.advantage_type in _TARGETED_TYPES:
                if body.target_contestant_id is None:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"{body.advantage_type} requires a" " target_contestant_id"
                        ),
                    )
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
            elif body.target_contestant_id is not None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"{body.advantage_type} does not take a" " target_contestant_id"
                    ),
                )

            cur.execute(
                """
                insert into advantage_plays
                    (user_id, season_id, episode_id, advantage_type,
                     target_contestant_id, token_cost)
                values (%s, %s, %s, %s, %s, 0)
                returning *
                """,
                [
                    str(user_id),
                    str(season_id),
                    episode["id"],
                    body.advantage_type,
                    (
                        str(body.target_contestant_id)
                        if body.target_contestant_id
                        else None
                    ),
                ],
            )
            return cur.fetchone()


def _get_own_play(cur, play_id: UUID, user_id: UUID) -> dict:
    cur.execute("select * from advantage_plays where id = %s", [str(play_id)])
    play = cur.fetchone()
    # 404 for other players' plays too: don't leak what they own
    if not play or str(play["user_id"]) != str(user_id):
        raise HTTPException(status_code=404, detail="Advantage not found")
    return play


@router.delete("/advantage-plays/{play_id}", status_code=204)
def take_back_advantage(play_id: UUID, user_id: UUID = Depends(get_current_user)):
    """Take this episode's play back while the episode is still open (#307).

    There is no inventory to return to any more — the play is simply undone
    and the week's allowance is free again. A roster_swap play can't be taken
    back here: the swap it paid for has already happened.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            play = _get_own_play(cur, play_id, user_id)

            cur.execute("select * from episodes where id = %s", [play["episode_id"]])
            episode = cur.fetchone()
            if episode_locked(episode):
                raise HTTPException(
                    status_code=400,
                    detail="Episode has locked; the advantage is spent",
                )

            if play["advantage_type"] == "roster_swap":
                raise HTTPException(
                    status_code=400,
                    detail="Undo the roster swap itself to get this play back",
                )

            cur.execute("delete from advantage_plays where id = %s", [str(play_id)])
