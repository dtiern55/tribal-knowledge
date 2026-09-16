"""Time travel for a seeded practice season (the S51 dry run, 2026-09-16).

The app has no "current episode": every page derives open / airing / scored
from each episode's status and picks_lock_at. So once a whole season has been
played through (scripts/dry_run.py seed), any point in it is one write away:
score the episodes before N, reopen N and everything after with far-future
locks, and the pages read as they would that week. What the bots did later
stays in the tables, hidden the way the future always is, behind the lock
rule (#559).

Refused for any season a real player is in, so it can never move the league.
"""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import database
from app.auth import get_current_admin
from app.schemas import Episode

router = APIRouter(tags=["dry-run"])

# A Wednesday 7pm Central, far enough out that nothing ever locks on its own
# (stage_staging.FROZEN).
FROZEN = datetime(2099, 1, 6, 1, 0, tzinfo=timezone.utc)


class JumpRequest(BaseModel):
    # The episode to land on, open for picks; None with complete=True ends the
    # season. `locked` lands on it after the lock instead (airing, unscored).
    episode: Optional[int] = None
    locked: bool = False
    complete: bool = False


@router.post("/seasons/{season_id}/jump", response_model=list[Episode])
def jump(season_id: UUID, body: JumpRequest, admin: UUID = Depends(get_current_admin)):
    if body.complete == (body.episode is not None):
        raise HTTPException(status_code=400, detail="Give an episode or complete")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            sid = str(season_id)
            cur.execute(
                """
                select 1 from league_seasons ls
                join league_members m on m.league_id = ls.league_id
                join profiles p on p.id = m.user_id
                where ls.season_id = %s and not p.is_bot and not p.is_admin limit 1
                """,
                [sid],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=403, detail="A season with real players can't jump"
                )
            cur.execute(
                "select episode_number from episodes where season_id = %s"
                " order by episode_number",
                [sid],
            )
            numbers = [r["episode_number"] for r in cur.fetchall()]
            if not numbers:
                raise HTTPException(status_code=400, detail="Season has no episodes")
            # Everything before N is scored; N and after are open again.
            n = max(numbers) + 1 if body.complete else body.episode
            if n not in numbers and not body.complete:
                raise HTTPException(status_code=404, detail="Episode not found")

            cur.execute(
                """
                update episodes set status = 'scored',
                  picks_lock_at = now() - (%(n)s - episode_number) * interval '1 week'
                where season_id = %(sid)s and episode_number < %(n)s
                """,
                {"sid": sid, "n": n},
            )
            cur.execute(
                """
                update episodes set status = 'upcoming',
                  picks_lock_at = %(frozen)s
                    + (episode_number - %(n)s) * interval '1 week'
                where season_id = %(sid)s and episode_number >= %(n)s
                """,
                {"sid": sid, "n": n, "frozen": FROZEN},
            )
            if body.locked:
                cur.execute(
                    "update episodes set picks_lock_at = now() - interval '1 minute'"
                    " where season_id = %s and episode_number = %s",
                    [sid, n],
                )
            cur.execute(
                "update seasons set status = %s where id = %s",
                ["completed" if body.complete else "active", sid],
            )

            # The merge tribe is the one fact that isn't episode-dated: its
            # members are the castaways alive going into the merge episode, so
            # it is rebuilt from the boots once that episode is scored and
            # emptied before.
            cur.execute(
                "select id from tribes where season_id = %s and is_merge", [sid]
            )
            merge = cur.fetchone()
            m = season["merge_episode"]
            if merge and m is not None:
                cur.execute(
                    "delete from contestant_tribes where tribe_id = %s", [merge["id"]]
                )
                if m < n:
                    cur.execute(
                        """
                        insert into contestant_tribes
                          (contestant_id, tribe_id, from_episode)
                        select c.id, %(tribe)s, %(m)s from contestants c
                        where c.season_id = %(sid)s and not exists (
                          select 1 from eliminations e
                          join episodes ep on ep.id = e.episode_id
                          where e.contestant_id = c.id and e.is_final
                            and ep.episode_number < %(m)s)
                        """,
                        {"tribe": merge["id"], "m": m, "sid": sid},
                    )

            # Forget the reveals from the future so the last scored episode's
            # card pops again on the next visit.
            cur.execute(
                """
                delete from reveal_acknowledgements ra
                using episodes e, league_seasons ls
                where ra.episode_id = e.id and ra.league_season_id = ls.id
                  and ls.season_id = %s and e.episode_number >= %s
                """,
                [sid, n],
            )

            # Landing past the roster lock with no tribe of your own leaves
            # every page thin, so the jumper gets a random one.
            cur.execute(
                """
                select ls.id, ls.roster_size, ls.roster_lock_episode
                from league_seasons ls
                join league_members m on m.league_id = ls.league_id and m.user_id = %s
                where ls.season_id = %s and not exists (
                  select 1 from roster_picks rp
                  where rp.league_season_id = ls.id and rp.user_id = %s)
                """,
                [str(admin), sid, str(admin)],
            )
            for ls in cur.fetchall():
                lock = ls["roster_lock_episode"] or 1
                if n <= lock:
                    continue
                cur.execute(
                    """
                    insert into roster_picks
                      (user_id, league_season_id, contestant_id, active_from_episode,
                       swap_penalty_points)
                    select %(uid)s, %(ls)s, c.id, %(lock)s, 0 from contestants c
                    where c.season_id = %(sid)s and not exists (
                      select 1 from eliminations e
                      join episodes ep on ep.id = e.episode_id
                      where e.contestant_id = c.id and e.is_final
                        and ep.episode_number < %(lock)s)
                    order by random() limit %(size)s
                    """,
                    {
                        "uid": str(admin),
                        "ls": str(ls["id"]),
                        "lock": lock,
                        "sid": sid,
                        "size": ls["roster_size"],
                    },
                )

            cur.execute(
                "select * from episodes where season_id = %s order by episode_number",
                [sid],
            )
            return cur.fetchall()
