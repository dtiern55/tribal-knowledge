from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException

from app import database
from app.schemas import EliminationPick, EliminationPickSubmitRequest

router = APIRouter(tags=["picks"])


@router.get(
    "/episodes/{episode_id}/picks/{user_id}", response_model=list[EliminationPick]
)
def get_picks(episode_id: UUID, user_id: UUID):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from episodes where id = %s", [str(episode_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Episode not found")
            cur.execute(
                """
                select * from elimination_picks
                where episode_id = %s and user_id = %s
                order by created_at
                """,
                [str(episode_id), str(user_id)],
            )
            return cur.fetchall()


@router.post("/episodes/{episode_id}/picks", response_model=list[EliminationPick])
def submit_picks(episode_id: UUID, body: EliminationPickSubmitRequest):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from episodes where id = %s", [str(episode_id)])
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")

            if episode["status"] != "picks_open":
                raise HTTPException(
                    status_code=400, detail="Picks are not open for this episode"
                )

            if episode["picks_lock_at"] <= datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=400, detail="Picks are locked for this episode"
                )

            if len(body.contestant_ids) > episode["max_elimination_picks"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Too many picks: max is {episode['max_elimination_picks']},"
                        f" got {len(body.contestant_ids)}"
                    ),
                )

            if len(body.contestant_ids) != len(set(body.contestant_ids)):
                raise HTTPException(
                    status_code=400, detail="Duplicate contestants in picks"
                )

            if body.contestant_ids:
                cur.execute(
                    "select id from contestants where season_id = %s and id in %s",
                    [
                        str(episode["season_id"]),
                        tuple(str(c) for c in body.contestant_ids),
                    ],
                )
                valid_id_strs = {row["id"] for row in cur.fetchall()}
                invalid = [
                    c for c in body.contestant_ids if str(c) not in valid_id_strs
                ]
                if invalid:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Contestants not in this season: {invalid}",
                    )

                cur.execute(
                    """
                    select e.contestant_id::text
                    from eliminations e
                    join episodes ep on e.episode_id = ep.id
                    where ep.season_id = %s
                      and ep.episode_number < %s
                      and e.contestant_id in %s
                    """,
                    [
                        str(episode["season_id"]),
                        episode["episode_number"],
                        tuple(str(c) for c in body.contestant_ids),
                    ],
                )
                already_eliminated = [row["contestant_id"] for row in cur.fetchall()]
                if already_eliminated:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Contestant(s) already eliminated: {already_eliminated}"
                        ),
                    )

            # Replace existing picks for this user/episode
            cur.execute(
                "delete from elimination_picks where episode_id = %s and user_id = %s",
                [str(episode_id), str(body.user_id)],
            )

            rows = []
            for cid in body.contestant_ids:
                cur.execute(
                    """
                    insert into elimination_picks (user_id, episode_id, contestant_id)
                    values (%s, %s, %s)
                    returning *
                    """,
                    [str(body.user_id), str(episode_id), str(cid)],
                )
                rows.append(cur.fetchone())
            return rows
