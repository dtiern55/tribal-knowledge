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
from app.routers.picks import already_eliminated_ids, pick_limit, redemption_island_ids
from app.schemas import AdvantagePlay, AdvantagePlayRequest, AdvantageType

router = APIRouter(tags=["advantage_plays"])

# Advantages that name a target. double_roster_points names a rostered
# contestant; double_vote_points ("Power Vote", #673) names one extra pick
# for this episode's ballot that pays double — it does not need to be
# rostered, only still pickable. extra_vote raises the pick limit and takes
# no target at all.
_TARGETED_TYPES = {"double_roster_points", "double_vote_points"}


@router.get("/advantage-types", response_model=list[AdvantageType])
def list_advantage_types(_: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select * from advantage_types where enabled = true order by token_cost"
            )
            return cur.fetchall()


@router.get(
    "/league-seasons/{league_season_id}/advantage-plays/{user_id}",
    response_model=list[AdvantagePlay],
)
def list_user_advantage_plays(
    league_season_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    """Own rows: everything, including unused inventory. Other players:
    only used advantages whose episode has locked — unused inventory is
    private strategy, like unlocked picks.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], current_user)
            if str(user_id) == str(current_user):
                cur.execute(
                    """
                    select * from advantage_plays
                    where league_season_id = %s and user_id = %s
                    order by created_at
                    """,
                    [str(league_season_id), str(user_id)],
                )
            else:
                cur.execute(
                    """
                    select ap.* from advantage_plays ap
                    join episodes ep on ep.id = ap.episode_id
                    where ap.league_season_id = %s and ap.user_id = %s
                      and (ep.picks_lock_at <= now() or ep.status = 'scored')
                    order by ap.created_at
                    """,
                    [str(league_season_id), str(user_id)],
                )
            plays = cur.fetchall()

        # Attach the bonus points each played double actually earned (#85).
        bonus = scoring.advantage_bonus_by_play(conn, league_season_id, user_id)
        for play in plays:
            play["points_earned"] = bonus.get(str(play["id"]))
        return plays


@router.post(
    "/league-seasons/{league_season_id}/advantage-plays",
    response_model=AdvantagePlay,
    status_code=201,
)
def play_advantage(
    league_season_id: UUID,
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
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], user_id)
            # Serializes the one-play check below against a concurrent play.
            database.lock_user_season(cur, user_id, league_season_id)

            episode = next_open_episode(cur, ls)
            if episode is None:
                raise HTTPException(
                    status_code=400,
                    detail="No open episode to play an advantage in",
                )

            if advantages_locked(
                episode["episode_number"],
                episode["is_finale"],
                ls["advantage_lock_episode"],
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

            if used_weekly_play(cur, user_id, league_season_id, episode["id"]):
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
                target_id = str(body.target_contestant_id)
                if body.advantage_type == "double_roster_points":
                    cur.execute(
                        """
                        select 1 from roster_picks
                        where user_id = %s and league_season_id = %s
                          and contestant_id = %s and active_until_episode is null
                        """,
                        [str(user_id), str(league_season_id), target_id],
                    )
                    if not cur.fetchone():
                        raise HTTPException(
                            status_code=400,
                            detail="Target contestant is not on your active roster",
                        )
                else:  # double_vote_points ("Power Vote", #673)
                    # The doubled name doesn't need to be rostered — only
                    # pickable, same rule submit_picks enforces on the ballot.
                    cur.execute(
                        "select 1 from contestants where id = %s and season_id = %s",
                        [target_id, str(ls["season_id"])],
                    )
                    if not cur.fetchone():
                        raise HTTPException(
                            status_code=400,
                            detail="Target contestant is not in this season",
                        )
                    if already_eliminated_ids(
                        cur,
                        str(ls["season_id"]),
                        episode["episode_number"],
                        [target_id],
                    ):
                        raise HTTPException(
                            status_code=400,
                            detail="Target contestant is already eliminated",
                        )
                    if redemption_island_ids(
                        cur, episode["episode_number"], [target_id]
                    ):
                        raise HTTPException(
                            status_code=400,
                            detail="Target contestant is on Redemption Island",
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
                    (user_id, league_season_id, episode_id, advantage_type,
                     target_contestant_id, token_cost)
                values (%s, %s, %s, %s, %s, 0)
                returning *
                """,
                [
                    str(user_id),
                    str(league_season_id),
                    episode["id"],
                    body.advantage_type,
                    (
                        str(body.target_contestant_id)
                        if body.target_contestant_id
                        else None
                    ),
                ],
            )
            play = cur.fetchone()

            # Power Vote's name is always a pick (#673) — add it to the
            # ballot here if it isn't already there, so playing it never
            # leaves the doubled slot empty. clock_timestamp(), not now(): see
            # the matching insert in picks.submit_picks for why.
            if body.advantage_type == "double_vote_points":
                cur.execute(
                    """
                    insert into elimination_picks
                        (user_id, league_season_id, episode_id, contestant_id,
                         created_at)
                    values (%s, %s, %s, %s, clock_timestamp())
                    on conflict (user_id, league_season_id, episode_id, contestant_id)
                        do nothing
                    """,
                    [
                        str(user_id),
                        str(league_season_id),
                        episode["id"],
                        target_id,
                    ],
                )
                # The Power Vote's name sits above the ladder (#694): it
                # holds no rung, and the rest close up behind it. Ranks are
                # cleared before they are reassigned so no two names ever
                # share a rung mid-way.
                cur.execute(
                    """
                    select id from elimination_picks
                    where user_id = %s and league_season_id = %s
                      and episode_id = %s and contestant_id <> %s
                    order by rank nulls last, created_at
                    """,
                    [str(user_id), str(league_season_id), episode["id"], target_id],
                )
                ranked = [row["id"] for row in cur.fetchall()]
                cur.execute(
                    "update elimination_picks set rank = null"
                    " where user_id = %s and league_season_id = %s and episode_id = %s",
                    [str(user_id), str(league_season_id), episode["id"]],
                )
                for rung, pick_id in enumerate(ranked, start=1):
                    cur.execute(
                        "update elimination_picks set rank = %s where id = %s",
                        [rung, str(pick_id)],
                    )

            return play


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
    back at all: the swap it paid for has already happened, and buying one is
    non-refundable by design (#394).
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
                    detail="That swap is already made — the play is spent",
                )

            cur.execute("delete from advantage_plays where id = %s", [str(play_id)])

            # Taking the Power Vote back keeps its name: it drops to the top
            # rung and the ladder shifts down (#694). Whatever falls past the
            # last rung is trimmed below. Ranks are cleared before they are
            # reassigned so no two names ever share a rung mid-way.
            if (
                play["advantage_type"] == "double_vote_points"
                and play["target_contestant_id"] is not None
            ):
                target = str(play["target_contestant_id"])
                cur.execute(
                    """
                    select id, contestant_id::text as contestant_id
                    from elimination_picks
                    where user_id = %s and league_season_id = %s and episode_id = %s
                    order by rank nulls last, created_at
                    """,
                    [
                        str(user_id),
                        str(play["league_season_id"]),
                        str(play["episode_id"]),
                    ],
                )
                rows = cur.fetchall()
                ordered = [r["id"] for r in rows if r["contestant_id"] == target] + [
                    r["id"] for r in rows if r["contestant_id"] != target
                ]
                cur.execute(
                    "update elimination_picks set rank = null"
                    " where user_id = %s and league_season_id = %s and episode_id = %s",
                    [
                        str(user_id),
                        str(play["league_season_id"]),
                        str(play["episode_id"]),
                    ],
                )
                for rung, pick_id in enumerate(ordered, start=1):
                    cur.execute(
                        "update elimination_picks set rank = %s where id = %s",
                        [rung, str(pick_id)],
                    )

            # The ladder is one name over the limit now that the play is gone:
            # keep the top rungs and drop the rest (#694; oldest first where
            # nothing is ranked, for a legacy null-target or extra_vote play).
            ls = database.require_league_season(cur, play["league_season_id"])
            limit = pick_limit(cur, ls, episode, user_id)
            cur.execute(
                """
                delete from elimination_picks
                where id in (
                    select id from elimination_picks
                    where league_season_id = %s and episode_id = %s and user_id = %s
                    order by rank nulls last, created_at, id
                    offset %s
                )
                """,
                [
                    str(play["league_season_id"]),
                    str(play["episode_id"]),
                    str(user_id),
                    limit,
                ],
            )
