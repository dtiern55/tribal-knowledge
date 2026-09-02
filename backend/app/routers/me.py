from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_user
from app.schemas import JoinRequest, ProfileUpdateRequest, UserProfile

router = APIRouter(tags=["me"])


def profile_with_leagues(cur, user_id: UUID) -> Optional[dict]:
    cur.execute(
        "select p.id, p.display_name, p.is_admin,"
        " coalesce(("
        "   select json_agg(json_build_object('id', l.id, 'name', l.name)"
        "                   order by m.joined_at)"
        "   from league_members m join leagues l on l.id = m.league_id"
        "   where m.user_id = p.id), '[]') as leagues"
        " from profiles p where p.id = %s",
        [str(user_id)],
    )
    return cur.fetchone()


@router.get("/me", response_model=UserProfile)
def get_me(user_id: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            row = profile_with_leagues(cur, user_id)
            if not row:
                raise HTTPException(status_code=404, detail="Profile not found")
            return row


@router.patch("/me", response_model=UserProfile)
def update_me(body: ProfileUpdateRequest, user_id: UUID = Depends(get_current_user)):
    """Let a member edit their own display name (issue #55)."""
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "update profiles set display_name = %s where id = %s returning 1",
                [body.display_name.strip(), str(user_id)],
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Profile not found")
            return profile_with_leagues(cur, user_id)


@router.post("/join", response_model=UserProfile, status_code=201)
def join_league(body: JoinRequest, user_id: UUID = Depends(get_current_user)):
    """Join the league whose code this is (#595).

    Gated by a per-league join code (decision 2026-07-07, issue #42) rather
    than an auth trigger or admin-only provisioning. The first join also
    creates the profile, so a display name is required then and ignored on
    later joins.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id from leagues where join_code = %s", [body.join_code.strip()]
            )
            league = cur.fetchone()
            if not league:
                raise HTTPException(status_code=400, detail="Invalid join code")

            cur.execute("select 1 from profiles where id = %s", [str(user_id)])
            if not cur.fetchone():
                name = (body.display_name or "").strip()
                if not name:
                    raise HTTPException(
                        status_code=422, detail="display_name is required to join"
                    )
                cur.execute(
                    "insert into profiles (id, display_name, is_admin)"
                    " values (%s, %s, false)",
                    [str(user_id), name],
                )

            cur.execute(
                "insert into league_members (league_id, user_id) values (%s, %s)"
                " on conflict do nothing returning 1",
                [league["id"], str(user_id)],
            )
            if not cur.fetchone():
                raise HTTPException(status_code=409, detail="Already a member")
            return profile_with_leagues(cur, user_id)
