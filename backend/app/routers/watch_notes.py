"""The commissioner's Watch tracker scratchpad (#737), stored server-side so
it's readable from any device — the scoring ritual reads it while scoring.

Admin-only, one row per league-season episode. The tracker owns the shape of
`data`; this just stores and returns it.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg2.extras import Json

from app import database
from app.auth import get_current_admin
from app.schemas import WatchNotes, WatchNotesEntry

router = APIRouter(tags=["watch_notes"])


def _require_episode(cur, episode_id: UUID) -> None:
    cur.execute("select id from episodes where id = %s", [str(episode_id)])
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Episode not found")


@router.get(
    "/league-seasons/{league_season_id}/episodes/{episode_id}/watch",
    response_model=WatchNotes,
)
def get_watch_notes(
    league_season_id: UUID,
    episode_id: UUID,
    _: UUID = Depends(get_current_admin),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_league_season(cur, league_season_id)
            _require_episode(cur, episode_id)
            cur.execute(
                "select data from episode_watch_notes"
                " where league_season_id = %s and episode_id = %s",
                [str(league_season_id), str(episode_id)],
            )
            row = cur.fetchone()
            return {"data": row["data"] if row else {}}


@router.put(
    "/league-seasons/{league_season_id}/episodes/{episode_id}/watch",
    response_model=WatchNotes,
)
def put_watch_notes(
    league_season_id: UUID,
    episode_id: UUID,
    body: WatchNotesEntry,
    _: UUID = Depends(get_current_admin),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_league_season(cur, league_season_id)
            _require_episode(cur, episode_id)
            cur.execute(
                "insert into episode_watch_notes"
                " (league_season_id, episode_id, data, updated_at)"
                " values (%s, %s, %s, now())"
                " on conflict (league_season_id, episode_id)"
                " do update set data = excluded.data, updated_at = now()"
                " returning data",
                [str(league_season_id), str(episode_id), Json(body.data)],
            )
            return {"data": cur.fetchone()["data"]}
