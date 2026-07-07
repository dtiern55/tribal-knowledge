import os
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import database

_bearer = HTTPBearer()

_jwks_client = jwt.PyJWKClient(
    f"{os.environ['SUPABASE_URL']}/auth/v1/.well-known/jwks.json"
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> UUID:
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(credentials.credentials)
        payload = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    return UUID(payload["sub"])


def get_current_admin(user_id: UUID = Depends(get_current_user)) -> UUID:
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select is_admin from profiles where id = %s", [str(user_id)])
            row = cur.fetchone()
    if not row or not row["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id
