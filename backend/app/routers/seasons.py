from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin, get_current_user
from app.schemas import Contestant, Season, SeasonCreateRequest, SeasonUpdateRequest

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[Season])
def list_seasons(_: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from seasons order by season_number")
            return cur.fetchall()


@router.get("/{season_id}/contestants", response_model=list[Contestant])
def list_contestants(season_id: UUID, _: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            cur.execute(
                """
                select c.*, ep.episode_number as eliminated_in_episode
                from contestants c
                left join eliminations e on e.contestant_id = c.id
                left join episodes ep on ep.id = e.episode_id
                where c.season_id = %s
                order by c.name
                """,
                [str(season_id)],
            )
            return cur.fetchall()


@router.post("", response_model=Season, status_code=201)
def create_season(body: SeasonCreateRequest, _: UUID = Depends(get_current_admin)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select 1 from seasons where season_number = %s",
                [body.season_number],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409, detail="season_number already exists"
                )
            cur.execute(
                """
                insert into seasons
                    (name, season_number, roster_size, roster_lock_episode,
                     merge_episode, winner_lock_episode, swap_token_cost,
                     free_swaps, weekly_token_allocation, winner_mode,
                     ss_lock_episode, status)
                values
                    (%(name)s, %(season_number)s, %(roster_size)s,
                     %(roster_lock_episode)s, %(merge_episode)s,
                     %(winner_lock_episode)s, %(swap_token_cost)s,
                     %(free_swaps)s, %(weekly_token_allocation)s,
                     %(winner_mode)s, %(ss_lock_episode)s, %(status)s)
                returning *
                """,
                body.model_dump(),
            )
            season = cur.fetchone()
            database.snapshot_scoring_config(cur, season["id"])
            return season


@router.patch("/{season_id}", response_model=Season)
def update_season(
    season_id: UUID, body: SeasonUpdateRequest, _: UUID = Depends(get_current_admin)
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            if "season_number" in fields:
                cur.execute(
                    "select 1 from seasons where season_number = %s and id <> %s",
                    [fields["season_number"], str(season_id)],
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409, detail="season_number already exists"
                    )
            set_clause = ", ".join(f"{k} = %({k})s" for k in fields)
            params = {**fields, "id": str(season_id)}
            cur.execute(
                f"update seasons set {set_clause} where id = %(id)s returning *",
                params,
            )
            return cur.fetchone()
