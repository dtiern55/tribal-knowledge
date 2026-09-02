from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg2 import errors

from app import database
from app.auth import get_current_admin, get_current_user
from app.schemas import (
    LeagueSeason,
    LeagueSeasonCreateRequest,
    LeagueSeasonUpdateRequest,
)

router = APIRouter(tags=["league_seasons"])


@router.get("/league-seasons", response_model=list[LeagueSeason])
def list_my_league_seasons(user_id: UUID = Depends(get_current_user)):
    """Every league-season the caller can play or browse (#595): those of the
    leagues they belong to, or all of them for an admin. Ordered by season
    number then league, so the frontend's default-season rule can stay simple.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                {database.LEAGUE_SEASON_SQL}
                where exists (select 1 from league_members m
                              where m.league_id = ls.league_id and m.user_id = %s)
                   or exists (select 1 from profiles p where p.id = %s and p.is_admin)
                order by s.season_number, l.created_at
                """,
                [str(user_id), str(user_id)],
            )
            return cur.fetchall()


@router.get("/league-seasons/{league_season_id}", response_model=LeagueSeason)
def get_league_season(
    league_season_id: UUID, user_id: UUID = Depends(get_current_user)
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], user_id)
            return ls


@router.post(
    "/leagues/{league_id}/seasons", response_model=LeagueSeason, status_code=201
)
def add_season_to_league(
    league_id: UUID,
    body: LeagueSeasonCreateRequest,
    _: UUID = Depends(get_current_admin),
):
    """Sign a league up to play a season, with its rule knobs."""
    fields = body.model_dump()
    cols = ", ".join(fields)
    vals = ", ".join(f"%({k})s" for k in fields)
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1 from leagues where id = %s", [str(league_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="League not found")
            database.require_season(cur, body.season_id)
            try:
                cur.execute(
                    f"insert into league_seasons (league_id, {cols})"
                    f" values (%(league_id)s, {vals}) returning id",
                    {
                        **{
                            k: str(v) if k == "season_id" else v
                            for k, v in fields.items()
                        },
                        "league_id": str(league_id),
                    },
                )
            except errors.UniqueViolation:
                raise HTTPException(
                    status_code=409, detail="League already plays this season"
                )
            return database.require_league_season(cur, cur.fetchone()["id"])


@router.patch("/league-seasons/{league_season_id}", response_model=LeagueSeason)
def update_league_season(
    league_season_id: UUID,
    body: LeagueSeasonUpdateRequest,
    _: UUID = Depends(get_current_admin),
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = %({k})s" for k in fields)
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_league_season(cur, league_season_id)
            cur.execute(
                f"update league_seasons set {set_clause} where id = %(id)s",
                {**fields, "id": str(league_season_id)},
            )
            return database.require_league_season(cur, league_season_id)
