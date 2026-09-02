from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin
from app.schemas import (
    League,
    LeagueCreateRequest,
    LeagueMember,
    LeagueUpdateRequest,
)

router = APIRouter(prefix="/leagues", tags=["leagues"])

LEAGUE_COLS = (
    "l.id, l.name, l.join_code, l.created_at,"
    " (select count(*) from league_members m where m.league_id = l.id)"
    " as member_count"
)


def _require_unused_code(cur, join_code: str, except_id: UUID | None = None) -> None:
    # Checked explicitly rather than caught as a unique violation: a failed
    # insert aborts the transaction, which the test client shares.
    cur.execute(
        "select 1 from leagues where join_code = %s and id <> coalesce(%s, id)",
        [join_code, str(except_id) if except_id else None],
    )
    if cur.fetchone():
        raise HTTPException(status_code=409, detail="join_code already in use")


@router.get("", response_model=list[League])
def list_leagues(_: UUID = Depends(get_current_admin)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"select {LEAGUE_COLS} from leagues l order by l.created_at")
            return cur.fetchall()


@router.post("", response_model=League, status_code=201)
def create_league(body: LeagueCreateRequest, _: UUID = Depends(get_current_admin)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            _require_unused_code(cur, body.join_code.strip())
            cur.execute(
                "insert into leagues (name, join_code) values (%s, %s) returning id",
                [body.name.strip(), body.join_code.strip()],
            )
            league_id = cur.fetchone()["id"]
            cur.execute(
                f"select {LEAGUE_COLS} from leagues l where l.id = %s", [league_id]
            )
            return cur.fetchone()


@router.patch("/{league_id}", response_model=League)
def update_league(
    league_id: UUID, body: LeagueUpdateRequest, _: UUID = Depends(get_current_admin)
):
    fields = {k: v.strip() for k, v in body.model_dump(exclude_unset=True).items()}
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = %({k})s" for k in fields)
    with database.get_db() as conn:
        with conn.cursor() as cur:
            if "join_code" in fields:
                _require_unused_code(cur, fields["join_code"], except_id=league_id)
            cur.execute(
                f"update leagues set {set_clause} where id = %(id)s returning id",
                {**fields, "id": str(league_id)},
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="League not found")
            cur.execute(
                f"select {LEAGUE_COLS} from leagues l where l.id = %s", [str(league_id)]
            )
            return cur.fetchone()


@router.get("/{league_id}/members", response_model=list[LeagueMember])
def list_members(league_id: UUID, _: UUID = Depends(get_current_admin)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1 from leagues where id = %s", [str(league_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="League not found")
            cur.execute(
                "select p.id, p.display_name, m.joined_at"
                " from league_members m join profiles p on p.id = m.user_id"
                " where m.league_id = %s order by m.joined_at",
                [str(league_id)],
            )
            return cur.fetchall()
