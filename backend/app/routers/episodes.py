from uuid import UUID

from fastapi import APIRouter, HTTPException

from app import database
from app.schemas import Episode

router = APIRouter(tags=["episodes"])


@router.get("/seasons/{season_id}/episodes", response_model=list[Episode])
def list_episodes(season_id: UUID):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")
            cur.execute(
                "select * from episodes where season_id = %s order by episode_number",
                [str(season_id)],
            )
            return cur.fetchall()


@router.get("/episodes/{episode_id}", response_model=Episode)
def get_episode(episode_id: UUID):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from episodes where id = %s", [str(episode_id)])
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Episode not found")
    return row
