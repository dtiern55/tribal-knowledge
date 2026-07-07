from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin
from app.schemas import LeagueSettings, LeagueSettingsUpdateRequest

router = APIRouter(tags=["league_settings"])


@router.get("/league-settings", response_model=LeagueSettings)
def get_league_settings(_: UUID = Depends(get_current_admin)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id, join_code, updated_at from league_settings limit 1")
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=500, detail="League settings not configured")
    return row


@router.patch("/league-settings", response_model=LeagueSettings)
def update_league_settings(
    body: LeagueSettingsUpdateRequest,
    _: UUID = Depends(get_current_admin),
):
    # No id in the request and no WHERE clause: the migration seeds exactly
    # one row and nothing else ever inserts into this table.
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                update league_settings
                set join_code = %s, updated_at = now()
                returning id, join_code, updated_at
                """,
                [body.join_code],
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=500, detail="League settings not configured")
    return row
