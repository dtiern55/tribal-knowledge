from uuid import UUID

from fastapi import APIRouter, Depends

from app import database, scoring
from app.auth import get_current_user
from app.locking import EPISODE_LOCKED_SQL
from app.schemas import ScoringBreakdown, StandingEntry

router = APIRouter(tags=["standings"])


@router.get("/seasons/{season_id}/standings", response_model=list[StandingEntry])
def get_standings(season_id: UUID, _: UUID = Depends(get_current_user)):
    """Live leaderboard: every league member's points for the season.

    Sums the three scoring components per user. Computed live, never cached.
    Ordered by total descending, then display name.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            # Admin/service accounts (e.g. Producer) never compete — issue #50.
            # A past (completed) season shows only who actually played it (had a
            # roster); an active/upcoming season shows every member (#235).
            if season["status"] == "completed":
                cur.execute(
                    "select p.id::text as id, p.display_name from profiles p"
                    " where not p.is_admin and exists ("
                    "   select 1 from roster_picks rp"
                    "   where rp.user_id = p.id and rp.season_id = %s)",
                    [str(season_id)],
                )
            else:
                cur.execute(
                    "select id::text as id, display_name from profiles"
                    " where not is_admin"
                )
            profiles = cur.fetchall()

        roster = scoring.roster_points(conn, season_id)
        elimination = scoring.elimination_points(conn, season_id)
        finale = scoring.finale_points(conn, season_id)

        # Trend arrow: rank now vs rank as of the previous scored episode
        # (current total minus the latest scored episode's contribution).
        with conn.cursor() as cur:
            cur.execute(
                "select max(episode_number) as n from episodes"
                " where season_id = %s and status = 'scored'",
                [str(season_id)],
            )
            last_scored = cur.fetchone()["n"]
        last_delta = (
            scoring.episode_points(conn, season_id, last_scored)
            if last_scored is not None
            else {}
        )

        # Still-in-the-game roster picks, so standings show who each player has
        # left at a glance (#83). Same visibility rule as the roster itself:
        # nothing until the roster lock passes, otherwise this would leak picks
        # while they're still being chosen.
        survivors: dict[str, list[dict]] = {}
        recently_eliminated: dict[str, list[dict]] = {}
        with conn.cursor() as cur:
            rosters_visible = False
            if season["roster_lock_episode"] is not None:
                cur.execute(
                    f"""
                    select 1 from episodes
                    where season_id = %s and episode_number = %s
                      and {EPISODE_LOCKED_SQL}
                    """,
                    [str(season_id), season["roster_lock_episode"]],
                )
                rosters_visible = cur.fetchone() is not None
            if rosters_visible:
                cur.execute(
                    """
                    select rp.user_id::text as user_id,
                           c.id::text as contestant_id, c.name, c.image_url,
                           tribe.name as tribe_name, tribe.color as tribe_color
                    from roster_picks rp
                    join contestants c on c.id = rp.contestant_id
                    left join lateral (
                      select t.name, t.color
                      from contestant_tribes ct
                      join tribes t on t.id = ct.tribe_id
                      where ct.contestant_id = c.id
                      order by ct.from_episode desc
                      limit 1
                    ) tribe on true
                    where rp.season_id = %s
                      and rp.active_until_episode is null
                      and not exists (
                        select 1 from eliminations e
                        where e.contestant_id = c.id)
                    order by c.name
                    """,
                    [str(season_id)],
                )
                for row in cur.fetchall():
                    survivors.setdefault(row["user_id"], []).append(
                        {
                            "contestant_id": row["contestant_id"],
                            "name": row["name"],
                            "image_url": row["image_url"],
                            "tribe_name": row["tribe_name"],
                            "tribe_color": row["tribe_color"],
                        }
                    )

                # Kept visible (greyed out) for one scored episode instead of
                # vanishing the instant they're voted out (#457). "Recently"
                # means eliminated in the latest *scored* episode specifically
                # — approximated from "airs" for simplicity.
                if last_scored is not None:
                    cur.execute(
                        """
                        select rp.user_id::text as user_id,
                               c.id::text as contestant_id, c.name, c.image_url,
                               tribe.name as tribe_name, tribe.color as tribe_color,
                               ep.episode_number as eliminated_episode
                        from roster_picks rp
                        join contestants c on c.id = rp.contestant_id
                        join eliminations el on el.contestant_id = c.id
                        join episodes ep on ep.id = el.episode_id
                        left join lateral (
                          select t.name, t.color
                          from contestant_tribes ct
                          join tribes t on t.id = ct.tribe_id
                          where ct.contestant_id = c.id
                          order by ct.from_episode desc
                          limit 1
                        ) tribe on true
                        where rp.season_id = %s
                          and rp.active_until_episode is null
                          and ep.episode_number = %s
                        order by c.name
                        """,
                        [str(season_id), last_scored],
                    )
                    for row in cur.fetchall():
                        recently_eliminated.setdefault(row["user_id"], []).append(
                            {
                                "contestant_id": row["contestant_id"],
                                "name": row["name"],
                                "image_url": row["image_url"],
                                "tribe_name": row["tribe_name"],
                                "tribe_color": row["tribe_color"],
                                "eliminated_episode": row["eliminated_episode"],
                            }
                        )

    entries = []
    for p in profiles:
        uid = p["id"]
        r = roster.get(uid, 0)
        e = elimination.get(uid, 0)
        f = finale.get(uid, 0)
        entries.append(
            StandingEntry(
                user_id=uid,
                display_name=p["display_name"],
                roster_points=r,
                elimination_points=e,
                finale_points=f,
                total_points=r + e + f,
                active_survivors=survivors.get(uid, []),
                recently_eliminated_survivors=recently_eliminated.get(uid, []),
            )
        )
    entries.sort(key=lambda s: (-s.total_points, s.display_name))

    if last_scored is not None:
        prev_rank = {
            s.user_id: i
            for i, s in enumerate(
                sorted(
                    entries,
                    key=lambda s: (
                        -(s.total_points - last_delta.get(str(s.user_id), 0)),
                        s.display_name,
                    ),
                )
            )
        }
        for now_rank, s in enumerate(entries):
            was = prev_rank[s.user_id]
            s.trend = "up" if was > now_rank else "down" if was < now_rank else "same"
            s.trend_delta = abs(was - now_rank)
            s.last_episode_points = last_delta.get(str(s.user_id), 0)
    return entries


@router.get(
    "/seasons/{season_id}/scoring-breakdown/{user_id}",
    response_model=ScoringBreakdown,
)
def get_scoring_breakdown(
    season_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    """Per-contestant roster points and per-pick results for one user (#52).

    Own breakdown: everything. Other players (#160): roster points only, and
    only once rosters lock — pick results stay out because per-episode votes
    have their own scored-only visibility path (#134).
    """
    is_owner = str(user_id) == str(current_user)
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            database.require_roster_visible(cur, season, user_id, current_user)
        roster = scoring.roster_points_by_contestant(conn, season_id, user_id)
        picks = (
            scoring.elimination_pick_results(conn, season_id, user_id)
            if is_owner
            else []
        )
    return {
        "roster": [
            {"contestant_id": cid, "points": pts} for cid, pts in roster.items()
        ],
        "picks": picks,
    }
