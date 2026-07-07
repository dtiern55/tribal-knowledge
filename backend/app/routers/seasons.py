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


@router.get("/{season_id}", response_model=Season)
def get_season(season_id: UUID, _: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from seasons where id = %s", [str(season_id)])
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Season not found")
    return row


@router.get("/{season_id}/contestants", response_model=list[Contestant])
def list_contestants(season_id: UUID, _: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")
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
                     merge_episode, winner_lock_episode, swap_penalty_points, status)
                values
                    (%(name)s, %(season_number)s, %(roster_size)s,
                     %(roster_lock_episode)s, %(merge_episode)s,
                     %(winner_lock_episode)s, %(swap_penalty_points)s, %(status)s)
                returning *
                """,
                body.model_dump(),
            )
            return cur.fetchone()


@router.patch("/{season_id}", response_model=Season)
def update_season(
    season_id: UUID, body: SeasonUpdateRequest, _: UUID = Depends(get_current_admin)
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1 from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")
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
