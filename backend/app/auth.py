import os
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import database

_bearer = HTTPBearer()


def _decode_token(credentials: HTTPAuthorizationCredentials = Depends(_bearer)) -> UUID:
    try:
        payload = jwt.decode(
            credentials.credentials,
            os.environ["SUPABASE_JWT_SECRET"],
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    return UUID(payload["sub"])


def get_current_user(user_id: UUID = Depends(_decode_token)) -> UUID:
    return user_id


def get_current_admin(user_id: UUID = Depends(get_current_user)) -> UUID:
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select is_admin from profiles where id = %s", [str(user_id)])
            row = cur.fetchone()
    if not row or not row["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id
