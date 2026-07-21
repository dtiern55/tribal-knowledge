from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin, get_current_user
from app.locking import advantages_locked
from app.schemas import Episode, EpisodeCreateRequest, EpisodeUpdateRequest

router = APIRouter(tags=["episodes"])


@router.get("/seasons/{season_id}/episodes", response_model=list[Episode])
def list_episodes(season_id: UUID, _: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            cur.execute(
                "select * from episodes where season_id = %s order by episode_number",
                [str(season_id)],
            )
            return cur.fetchall()


@router.post("/seasons/{season_id}/episodes", response_model=Episode, status_code=201)
def create_episode(
    season_id: UUID, body: EpisodeCreateRequest, _: UUID = Depends(get_current_admin)
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            cur.execute(
                "select 1 from episodes where season_id = %s and episode_number = %s",
                [str(season_id), body.episode_number],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409, detail="episode_number already exists"
                )
            if body.is_finale:
                cur.execute(
                    "select 1 from episodes where season_id = %s and is_finale",
                    [str(season_id)],
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409,
                        detail="Season already has a finale episode",
                    )
            params = {**body.model_dump(), "season_id": str(season_id)}
            cur.execute(
                """
                insert into episodes
                    (season_id, episode_number, air_date, max_elimination_picks,
                     is_finale, picks_lock_at)
                values
                    (%(season_id)s, %(episode_number)s, %(air_date)s,
                     %(max_elimination_picks)s, %(is_finale)s, %(picks_lock_at)s)
                returning *
                """,
                params,
            )
            episode = cur.fetchone()

            # Fund the episode the moment its row exists (#217): one weekly
            # allocation per player per episode, granted here rather than when
            # the prior episode is scored — so a grant can never be silently
            # lost by scoring before the next episode has been created, and no
            # manual season-start bootstrap is required. Skipped past the
            # advantage lock (nothing left to spend on) or when allocation is 0.
            cur.execute(
                "select weekly_token_allocation, advantage_lock_episode"
                " from seasons where id = %s",
                [str(season_id)],
            )
            srow = cur.fetchone()
            amount = srow["weekly_token_allocation"]
            if amount > 0 and not advantages_locked(
                episode["episode_number"],
                episode["is_finale"],
                srow["advantage_lock_episode"],
            ):
                cur.execute(
                    """
                    insert into token_transactions
                        (user_id, season_id, episode_id, transaction_type, amount)
                    select p.id, %(season)s, %(episode)s, 'weekly_allocation',
                           %(amount)s
                    from profiles p
                    where not p.is_admin
                    on conflict do nothing
                    """,
                    {
                        "season": str(season_id),
                        "episode": str(episode["id"]),
                        "amount": amount,
                    },
                )
            return episode


@router.patch("/episodes/{episode_id}", response_model=Episode)
def update_episode(
    episode_id: UUID, body: EpisodeUpdateRequest, _: UUID = Depends(get_current_admin)
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select season_id from episodes where id = %s", [str(episode_id)]
            )
            existing = cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Episode not found")
            if "episode_number" in fields:
                cur.execute(
                    "select 1 from episodes"
                    " where season_id = %s and episode_number = %s and id <> %s",
                    [existing["season_id"], fields["episode_number"], str(episode_id)],
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409, detail="episode_number already exists"
                    )
            if fields.get("is_finale"):
                cur.execute(
                    "select 1 from episodes"
                    " where season_id = %s and is_finale and id <> %s",
                    [existing["season_id"], str(episode_id)],
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409,
                        detail="Season already has a finale episode",
                    )
            set_clause = ", ".join(f"{k} = %({k})s" for k in fields)
            params = {**fields, "id": str(episode_id)}
            cur.execute(
                f"update episodes set {set_clause} where id = %(id)s returning *",
                params,
            )
            return cur.fetchone()


@router.post("/episodes/{episode_id}/score", response_model=Episode)
def score_episode(episode_id: UUID, _: UUID = Depends(get_current_admin)):
    """Mark the episode scored — one admin action ends the Friday ritual
    (issue #49). Weekly token allocations are granted at episode-create time,
    not here (#217).
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from episodes where id = %s", [str(episode_id)])
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")
            if episode["status"] == "scored":
                raise HTTPException(status_code=409, detail="Episode already scored")
            if datetime.now(timezone.utc) < episode["picks_lock_at"]:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot score episode before picks are locked",
                )
            # Auto-unplay unused extra votes (#157): played-but-unused vote
            # capacity is an artifact of the play-then-pick two-step, not a
            # strategic choice — revert the surplus plays (newest first) to
            # inventory so they can be replayed later. Nothing is refunded;
            # inventory left at season end stays dead per #85.
            cur.execute(
                """
                with played as (
                    select ap.id, ap.user_id,
                           row_number() over (partition by ap.user_id
                                              order by ap.created_at desc) as rn,
                           count(*) over (partition by ap.user_id) as extras
                    from advantage_plays ap
                    where ap.episode_id = %(ep)s
                      and ap.advantage_type = 'extra_vote'
                ), picked as (
                    select user_id, count(*) as n from elimination_picks
                    where episode_id = %(ep)s group by user_id
                )
                update advantage_plays set episode_id = null
                where id in (
                    select p.id from played p
                    left join picked k on k.user_id = p.user_id
                    -- unused capacity = (base max + extras) - picks made
                    where p.rn <= least(
                        p.extras,
                        %(base)s + p.extras - coalesce(k.n, 0)
                    )
                )
                """,
                {"ep": str(episode_id), "base": episode["max_elimination_picks"]},
            )

            # Weekly token allocations are granted when an episode is created,
            # not here (#217). Scoring only closes the episode out.
            cur.execute(
                "update episodes set status = 'scored' where id = %s returning *",
                [str(episode_id)],
            )
            return cur.fetchone()
