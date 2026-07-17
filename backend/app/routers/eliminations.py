from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin, get_current_user
from app.schemas import Elimination, EliminationEntry

router = APIRouter(tags=["eliminations"])


@router.get("/episodes/{episode_id}/eliminations", response_model=list[Elimination])
def list_eliminations(episode_id: UUID, _: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from episodes where id = %s", [str(episode_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Episode not found")
            cur.execute(
                "select * from eliminations where episode_id = %s order by created_at",
                [str(episode_id)],
            )
            return cur.fetchall()


@router.post("/episodes/{episode_id}/eliminations", response_model=list[Elimination])
def set_eliminations(
    episode_id: UUID, body: list[EliminationEntry], _: UUID = Depends(get_current_admin)
):
    if len({e.contestant_id for e in body}) != len(body):
        raise HTTPException(status_code=400, detail="Duplicate contestants in request")

    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select season_id from episodes where id = %s", [str(episode_id)]
            )
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")

            if body:
                contestant_ids = [str(e.contestant_id) for e in body]
                cur.execute(
                    "select id::text from contestants"
                    " where season_id = %s and id::text = any(%s)",
                    [str(episode["season_id"]), contestant_ids],
                )
                valid_ids = {row["id"] for row in cur.fetchall()}
                invalid = [c for c in contestant_ids if c not in valid_ids]
                if invalid:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Contestants not in this season: {invalid}",
                    )

                # Additive (issue #71): reject anyone already eliminated
                # anywhere in the season, including this episode.
                cur.execute(
                    """
                    select e.contestant_id::text
                    from eliminations e
                    join episodes ep on e.episode_id = ep.id
                    where ep.season_id = %s
                      and e.contestant_id::text = any(%s)
                    """,
                    [str(episode["season_id"]), contestant_ids],
                )
                already_out = [row["contestant_id"] for row in cur.fetchall()]
                if already_out:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Contestants already eliminated: {already_out}",
                    )

            rows = []
            for entry in body:
                cur.execute(
                    "insert into eliminations"
                    " (episode_id, contestant_id, elimination_type)"
                    " values (%s, %s, %s) returning *",
                    [str(episode_id), str(entry.contestant_id), entry.elimination_type],
                )
                rows.append(cur.fetchone())
            return rows


@router.delete("/eliminations/{elimination_id}", status_code=204)
def delete_elimination(elimination_id: UUID, _: UUID = Depends(get_current_admin)):
    """Remove one elimination (issue #71)."""
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "delete from eliminations where id = %s returning id",
                [str(elimination_id)],
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Elimination not found")
