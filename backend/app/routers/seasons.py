from uuid import UUID

from fastapi import APIRouter, HTTPException

from app import database
from app.schemas import Contestant, Season

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[Season])
def list_seasons():
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from seasons order by season_number")
            return cur.fetchall()


@router.get("/{season_id}", response_model=Season)
def get_season(season_id: UUID):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from seasons where id = %s", [str(season_id)])
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Season not found")
    return row


@router.get("/{season_id}/contestants", response_model=list[Contestant])
def list_contestants(season_id: UUID):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")
            cur.execute(
                "select * from contestants where season_id = %s order by name",
                [str(season_id)],
            )
            return cur.fetchall()
