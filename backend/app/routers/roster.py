from uuid import UUID

from fastapi import APIRouter, HTTPException

from app import database
from app.schemas import RosterPick, RosterSubmitRequest, RosterSwapRequest

router = APIRouter(tags=["roster"])


@router.get("/seasons/{season_id}/roster/{user_id}", response_model=list[RosterPick])
def get_roster(season_id: UUID, user_id: UUID):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")
            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and season_id = %s
                order by active_from_episode, contestant_id
                """,
                [str(user_id), str(season_id)],
            )
            return cur.fetchall()


@router.post("/seasons/{season_id}/roster", response_model=list[RosterPick])
def submit_roster(season_id: UUID, body: RosterSubmitRequest):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from seasons where id = %s", [str(season_id)])
            season = cur.fetchone()
            if not season:
                raise HTTPException(status_code=404, detail="Season not found")

            if season["roster_lock_episode"] is None:
                raise HTTPException(
                    status_code=400,
                    detail="Roster lock episode not set for this season",
                )

            if len(body.contestant_ids) != season["roster_size"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Expected {season['roster_size']} contestants,"
                        f" got {len(body.contestant_ids)}"
                    ),
                )

            if len(body.contestant_ids) != len(set(body.contestant_ids)):
                raise HTTPException(
                    status_code=400, detail="Duplicate contestants in roster"
                )

            cur.execute(
                "select id from roster_picks"
                " where user_id = %s and season_id = %s limit 1",
                [str(body.user_id), str(season_id)],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409, detail="Roster already submitted for this season"
                )

            if body.contestant_ids:
                cur.execute(
                    "select id::text as id from contestants"
                    " where season_id = %s and id in %s",
                    [str(season_id), tuple(str(c) for c in body.contestant_ids)],
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

            rows = []
            for cid in body.contestant_ids:
                cur.execute(
                    """
                    insert into roster_picks
                        (user_id, season_id, contestant_id, active_from_episode)
                    values (%s, %s, %s, %s)
                    returning *
                    """,
                    [
                        str(body.user_id),
                        str(season_id),
                        str(cid),
                        season["roster_lock_episode"],
                    ],
                )
                rows.append(cur.fetchone())
            return rows


@router.post("/seasons/{season_id}/roster/swap", response_model=RosterPick)
def swap_roster_pick(season_id: UUID, body: RosterSwapRequest):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select swap_penalty_points from seasons where id = %s",
                [str(season_id)],
            )
            season = cur.fetchone()
            if not season:
                raise HTTPException(status_code=404, detail="Season not found")

            cur.execute(
                "select * from episodes where id = %s and season_id = %s",
                [str(body.episode_id), str(season_id)],
            )
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")

            cur.execute(
                """
                select * from roster_picks
                where user_id = %s and season_id = %s
                  and contestant_id = %s and active_until_episode is null
                """,
                [str(body.user_id), str(season_id), str(body.old_contestant_id)],
            )
            old_pick = cur.fetchone()
            if not old_pick:
                raise HTTPException(
                    status_code=400,
                    detail="Contestant is not on the active roster",
                )

            swap_episode = episode["episode_number"]
            if swap_episode <= old_pick["active_from_episode"]:
                raise HTTPException(
                    status_code=400,
                    detail="Swap episode must be after the contestant was added",
                )

            cur.execute(
                "select id from contestants where id = %s and season_id = %s",
                [str(body.new_contestant_id), str(season_id)],
            )
            if not cur.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="New contestant not found in this season",
                )

            # Explicit check — unique constraint would fire otherwise
            cur.execute(
                "select id from roster_picks"
                " where user_id = %s and season_id = %s and contestant_id = %s",
                [str(body.user_id), str(season_id), str(body.new_contestant_id)],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail="Contestant has already been on this roster",
                )

            cur.execute(
                """
                update roster_picks
                set active_until_episode = %s, swap_penalty_points = %s
                where id = %s
                """,
                [swap_episode - 1, season["swap_penalty_points"], str(old_pick["id"])],
            )

            cur.execute(
                """
                insert into roster_picks
                    (user_id, season_id, contestant_id, active_from_episode)
                values (%s, %s, %s, %s)
                returning *
                """,
                [
                    str(body.user_id),
                    str(season_id),
                    str(body.new_contestant_id),
                    swap_episode,
                ],
            )
            return cur.fetchone()
