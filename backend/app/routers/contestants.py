from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin
from app.schemas import Contestant, ContestantsCreateRequest, ContestantUpdateRequest

router = APIRouter(tags=["contestants"])


@router.post(
    "/seasons/{season_id}/contestants",
    response_model=list[Contestant],
    status_code=201,
)
def create_contestants(
    season_id: UUID,
    body: ContestantsCreateRequest,
    _: UUID = Depends(get_current_admin),
):
    if len(body.names) != len(set(body.names)):
        raise HTTPException(status_code=400, detail="Duplicate names in request")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            cur.execute(
                "select name from contestants where season_id = %s and name = any(%s)",
                [str(season_id), body.names],
            )
            existing = [row["name"] for row in cur.fetchall()]
            if existing:
                raise HTTPException(
                    status_code=409, detail=f"Contestants already exist: {existing}"
                )
            rows = []
            for name in body.names:
                cur.execute(
                    "insert into contestants (season_id, name)"
                    " values (%s, %s) returning *",
                    [str(season_id), name],
                )
                rows.append(cur.fetchone())
            return rows


@router.patch("/contestants/{contestant_id}", response_model=Contestant)
def update_contestant(
    contestant_id: UUID,
    body: ContestantUpdateRequest,
    _: UUID = Depends(get_current_admin),
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select season_id from contestants where id = %s",
                [str(contestant_id)],
            )
            existing = cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Contestant not found")
            if "name" in fields:
                cur.execute(
                    "select 1 from contestants"
                    " where season_id = %s and name = %s and id <> %s",
                    [existing["season_id"], fields["name"], str(contestant_id)],
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409,
                        detail="Contestant name already exists in this season",
                    )
            set_clause = ", ".join(f"{k} = %({k})s" for k in fields)
            params = {**fields, "id": str(contestant_id)}
            cur.execute(
                f"update contestants set {set_clause} where id = %(id)s returning *",
                params,
            )
            return cur.fetchone()
