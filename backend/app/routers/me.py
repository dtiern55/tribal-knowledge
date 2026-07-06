from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_user
from app.schemas import UserProfile

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
