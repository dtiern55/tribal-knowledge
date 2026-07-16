from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_user
from app.schemas import JoinRequest, ProfileUpdateRequest, UserProfile

router = APIRouter(tags=["me"])


@router.get("/me", response_model=UserProfile)
def get_me(user_id: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id, display_name, is_admin from profiles where id = %s",
                [str(user_id)],
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            return row


@router.patch("/me", response_model=UserProfile)
def update_me(body: ProfileUpdateRequest, user_id: UUID = Depends(get_current_user)):
    """Let a member edit their own display name (issue #55)."""
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "update profiles set display_name = %s where id = %s"
                " returning id, display_name, is_admin",
                [body.display_name.strip(), str(user_id)],
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            return row


@router.post("/join", response_model=UserProfile, status_code=201)
def join_league(body: JoinRequest, user_id: UUID = Depends(get_current_user)):
    """Turn an authenticated Supabase Auth account into a league member.

    Gated by a shared join code (decision 2026-07-07, issue #42) rather than
    an auth trigger or admin-only provisioning — see league_settings.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1 from profiles where id = %s", [str(user_id)])
            if cur.fetchone():
                raise HTTPException(status_code=409, detail="Already joined")

            cur.execute("select join_code from league_settings limit 1")
            settings = cur.fetchone()
            if not settings:
                raise HTTPException(
                    status_code=500, detail="League settings not configured"
                )
            if body.join_code.strip() != settings["join_code"]:
                raise HTTPException(status_code=400, detail="Invalid join code")

            cur.execute(
                """
                insert into profiles (id, display_name, is_admin)
                values (%s, %s, false)
                returning id, display_name, is_admin
                """,
                [str(user_id), body.display_name.strip()],
            )
            return cur.fetchone()
