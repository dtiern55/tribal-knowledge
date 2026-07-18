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
            return cur.fetchone()


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
            set_clause = ", ".join(f"{k} = %({k})s" for k in fields)
            params = {**fields, "id": str(episode_id)}
            cur.execute(
                f"update episodes set {set_clause} where id = %(id)s returning *",
                params,
            )
            return cur.fetchone()


@router.post("/episodes/{episode_id}/score", response_model=Episode)
def score_episode(episode_id: UUID, _: UUID = Depends(get_current_admin)):
    """Mark the episode scored and grant every player the season's weekly
    token allocation (issue #49) — one admin action ends the Friday ritual.
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
            cur.execute(
                "update episodes set status = 'scored' where id = %s returning *",
                [str(episode_id)],
            )
            scored = cur.fetchone()

            cur.execute(
                "select weekly_token_allocation, advantage_lock_episode"
                " from seasons where id = %s",
                [episode["season_id"]],
            )
            srow = cur.fetchone()
            amount = srow["weekly_token_allocation"]
            # Token earning stops at the advantage cutoff (issue #85) — no grant.
            locked = advantages_locked(
                episode["episode_number"],
                episode["is_finale"],
                srow["advantage_lock_episode"],
            )
            if amount > 0 and not locked:
                # Idempotent against manual weekly-allocation grants for the
                # same episode (the corrections endpoint in tokens.py).
                cur.execute(
                    """
                    insert into token_transactions
                        (user_id, season_id, episode_id, transaction_type, amount)
                    select p.id, %(season)s, %(episode)s, 'weekly_allocation',
                           %(amount)s
                    from profiles p
                    where not p.is_admin
                      and not exists (
                        select 1 from token_transactions tt
                        where tt.user_id = p.id
                          and tt.season_id = %(season)s
                          and tt.episode_id = %(episode)s
                          and tt.transaction_type = 'weekly_allocation'
                    )
                    """,
                    {
                        "season": episode["season_id"],
                        "episode": str(episode_id),
                        "amount": amount,
                    },
                )
            return scored
