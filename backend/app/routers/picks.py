from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg2 import errors as pg_errors

from app import database
from app.auth import get_current_user
from app.locking import episode_locked, next_open_episode
from app.schemas import EliminationPick, EliminationPickSubmitRequest

router = APIRouter(tags=["picks"])


@router.get(
    "/episodes/{episode_id}/picks/{user_id}", response_model=list[EliminationPick]
)
def get_picks(
    episode_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select picks_lock_at, status from episodes where id = %s",
                [str(episode_id)],
            )
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")

            # Other players' picks stay hidden until the episode is scored
            # (#134) — post-lock but pre-scoring they're still private.
            if str(user_id) != str(current_user) and episode["status"] != "scored":
                raise HTTPException(
                    status_code=403,
                    detail="Picks are hidden until the episode is scored",
                )
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
def submit_picks(
    episode_id: UUID,
    body: EliminationPickSubmitRequest,
    user_id: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from episodes where id = %s", [str(episode_id)])
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")

            if episode_locked(episode):
                raise HTTPException(
                    status_code=400, detail="Picks are locked for this episode"
                )

            # Week-by-week rule: only the next unlocked episode accepts picks
            next_open = next_open_episode(cur, str(episode["season_id"]))
            if next_open is None:
                raise HTTPException(
                    status_code=400, detail="No episode is currently open for picks"
                )
            if next_open["id"] != episode["id"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Picks are only open for episode"
                        f" {next_open['episode_number']}"
                    ),
                )

            # Extra Vote advantage raises this episode's pick limit by one
            cur.execute(
                """
                select count(*) as n from advantage_plays
                where user_id = %s and episode_id = %s
                  and advantage_type = 'extra_vote'
                """,
                [str(user_id), str(episode_id)],
            )
            max_picks = episode["max_elimination_picks"] + cur.fetchone()["n"]

            # You can never pick every remaining option — extra votes only go up
            # to (contestants still in the game − 1) (#240).
            cur.execute(
                "select count(*) as n from contestants c"
                " where c.season_id = %s and not exists ("
                "   select 1 from eliminations e"
                "   join episodes ep on ep.id = e.episode_id"
                "   where e.contestant_id = c.id and ep.episode_number < %s)",
                [str(episode["season_id"]), episode["episode_number"]],
            )
            still_in = cur.fetchone()["n"]
            max_picks = min(max_picks, max(still_in - 1, 0))

            if len(body.contestant_ids) > max_picks:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Too many picks: max is {max_picks},"
                        f" got {len(body.contestant_ids)}"
                    ),
                )

            if len(body.contestant_ids) != len(set(body.contestant_ids)):
                raise HTTPException(
                    status_code=400, detail="Duplicate contestants in picks"
                )

            ids = [str(c) for c in body.contestant_ids]
            cur.execute(
                "select id::text as id from contestants"
                " where season_id = %s and id::text = any(%s)",
                [str(episode["season_id"]), ids],
            )
            valid_id_strs = {row["id"] for row in cur.fetchall()}
            invalid = [c for c in ids if c not in valid_id_strs]
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
                  and e.contestant_id::text = any(%s)
                """,
                [str(episode["season_id"]), episode["episode_number"], ids],
            )
            already_eliminated = [row["contestant_id"] for row in cur.fetchall()]
            if already_eliminated:
                raise HTTPException(
                    status_code=400,
                    detail=(f"Contestant(s) already eliminated: {already_eliminated}"),
                )

            # Replace existing picks for this user/episode. An empty list is
            # intentionally allowed and clears the user's picks for the episode.
            cur.execute(
                "delete from elimination_picks where episode_id = %s and user_id = %s",
                [str(episode_id), str(user_id)],
            )

            rows = []
            try:
                for cid in body.contestant_ids:
                    cur.execute(
                        """
                        insert into elimination_picks
                            (user_id, episode_id, contestant_id)
                        values (%s, %s, %s)
                        returning *
                        """,
                        [str(user_id), str(episode_id), str(cid)],
                    )
                    rows.append(cur.fetchone())
            except pg_errors.UniqueViolation:
                # Concurrent double-submit raced past the delete above (#120)
                raise HTTPException(
                    status_code=409, detail="Picks already submitted — try again"
                )
            return rows
