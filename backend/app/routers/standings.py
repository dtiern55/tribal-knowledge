from uuid import UUID

from fastapi import APIRouter, Depends

from app import database, scoring
from app.auth import get_current_user
from app.locking import (
    EPISODE_LOCKED_SQL,
    episode_locked_sql,
    latest_locked_episode,
)
from app.routers.roster import _effective_ss_lock, _episode_locked
from app.schemas import ScoringBreakdown, StandingEntry

router = APIRouter(tags=["standings"])


def league_field(cur, ls: dict) -> list[dict]:
    """Who competes in a league-season: the league's players (#595).

    Service accounts like Producer are is_player = false (#471). A past
    (completed) season shows only who actually played it (had a roster); an
    active/upcoming season shows every member (#235).
    """
    if ls["status"] == "completed":
        cur.execute(
            "select p.id::text as id, p.display_name from profiles p"
            " where p.is_player and exists ("
            "   select 1 from roster_picks rp"
            "   where rp.user_id = p.id and rp.league_season_id = %s)",
            [str(ls["id"])],
        )
    else:
        cur.execute(
            "select p.id::text as id, p.display_name from profiles p"
            " join league_members m on m.user_id = p.id"
            " where p.is_player and m.league_id = %s",
            [str(ls["league_id"])],
        )
    return cur.fetchall()


@router.get(
    "/league-seasons/{league_season_id}/standings",
    response_model=list[StandingEntry],
)
def get_standings(league_season_id: UUID, user_id: UUID = Depends(get_current_user)):
    """Live leaderboard: every league member's points for the season.

    Sums the three scoring components per user. Computed live, never cached.
    Ordered by total descending, then display name.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_league_season(cur, league_season_id)
            database.require_member(cur, season["league_id"], user_id)
            profiles = league_field(cur, season)
            season_id = str(season["season_id"])

        roster = scoring.roster_points(conn, league_season_id)
        elimination = scoring.elimination_points(conn, league_season_id)
        finale = scoring.finale_points(conn, league_season_id)

        # Trend arrow: rank now vs rank as of the previous scored episode
        # (current total minus the latest scored episode's contribution).
        with conn.cursor() as cur:
            cur.execute(
                "select max(episode_number) as n from episodes"
                " where season_id = %s and status = 'scored'",
                [season_id],
            )
            last_scored = cur.fetchone()["n"]
        last_delta = (
            scoring.episode_points(conn, league_season_id, last_scored)
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
                    [season_id, season["roster_lock_episode"]],
                )
                rosters_visible = cur.fetchone() is not None
            if rosters_visible:
                # Every roster here reads as it stood at the latest LOCKED
                # episode, yours included (Danny 2026-09-09). The Team page
                # bounds only other players (#164) because it answers "who is
                # on this roster"; standings answers "where the league stands",
                # and a row pairing next week's roster with last week's points
                # is a mismatch. Bounding your own row too is also what keeps
                # the torch count at roster size: a pending swap-in alongside
                # the snuffed torch of the castaway it replaced would show both.
                locked_through = latest_locked_episode(cur, season_id)
                cur.execute(
                    f"""
                    select rp.user_id::text as user_id,
                           c.id::text as contestant_id,
                           coalesce(c.nickname, c.name) as name, c.image_url,
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
                    where rp.league_season_id = %(ls)s
                      and case
                            when %(through)s is null
                            then rp.active_until_episode is null
                            else rp.active_from_episode <= %(through)s
                             and (rp.active_until_episode is null
                                  or rp.active_until_episode >= %(through)s)
                          end
                      and not exists (
                        select 1 from eliminations e
                        join episodes ep on ep.id = e.episode_id
                        where e.contestant_id = c.id and e.is_final
                          and {episode_locked_sql("ep")})
                    order by c.name
                    """,
                    {"ls": str(league_season_id), "through": locked_through},
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

                # Kept visible (greyed out) after they go home instead of
                # vanishing the instant they're voted out (#457), and held
                # through the wait and the airing — the week you lost someone is
                # the context you want while watching the next one.
                #
                # The window is the roster as it stood during that scored
                # episode, not the roster today: swapping the corpse out must
                # not erase the week they died on your team. Rachel died in S27
                # episode 3 while on 13 rosters and 11 of them swapped her out
                # that night, which used to leave almost no trace of the boot.
                #
                # It clears when the NEXT episode locks (Danny 2026-09-09), not
                # when that episode is scored: at lock the replacements go live
                # above, and carrying the old snuffs as well would push a row
                # past its roster size.
                if last_scored is not None and locked_through == last_scored:
                    cur.execute(
                        """
                        select rp.user_id::text as user_id,
                               c.id::text as contestant_id,
                               coalesce(c.nickname, c.name) as name, c.image_url,
                               tribe.name as tribe_name, tribe.color as tribe_color,
                               ep.episode_number as eliminated_episode
                        from roster_picks rp
                        join contestants c on c.id = rp.contestant_id
                        join eliminations el
                          on el.contestant_id = c.id and el.is_final
                        join episodes ep on ep.id = el.episode_id
                        left join lateral (
                          select t.name, t.color
                          from contestant_tribes ct
                          join tribes t on t.id = ct.tribe_id
                          where ct.contestant_id = c.id
                          order by ct.from_episode desc
                          limit 1
                        ) tribe on true
                        where rp.league_season_id = %(ls)s
                          and rp.active_from_episode <= %(scored)s
                          and (rp.active_until_episode is null
                               or rp.active_until_episode >= %(scored)s)
                          and ep.episode_number = %(scored)s
                        order by c.name
                        """,
                        {"ls": str(league_season_id), "scored": last_scored},
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

        # Which castaway each roster is backing as Sole Survivor, so standings
        # can fly the champion flame (#164). Revealed only once the designation
        # locks (same rule as the locked-page gold name, #685); the flame renders
        # only on a torch already shown above, so this leaks nothing the roster
        # doesn't.
        sole_survivor: dict[str, str] = {}
        ss_lock = _effective_ss_lock(season)
        if ss_lock is not None:
            with conn.cursor() as cur:
                if _episode_locked(cur, season_id, ss_lock):
                    cur.execute(
                        "select user_id::text as user_id,"
                        " contestant_id::text as contestant_id"
                        " from roster_picks"
                        " where league_season_id = %s and is_sole_survivor",
                        [str(league_season_id)],
                    )
                    sole_survivor = {
                        r["user_id"]: r["contestant_id"] for r in cur.fetchall()
                    }

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
                sole_survivor_contestant_id=sole_survivor.get(uid),
            )
        )
    entries.sort(key=lambda s: (-s.total_points, s.display_name))

    # Before the first episode that awards points, every player sits at zero and
    # the "previous" order is alphabetical, so nobody has a place to have moved
    # from. Movement starts once there is a standing to move from.
    had_standing = any(
        s.total_points - last_delta.get(str(s.user_id), 0) != 0 for s in entries
    )
    if last_scored is not None and had_standing:
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
    "/league-seasons/{league_season_id}/scoring-breakdown/{user_id}",
    response_model=ScoringBreakdown,
)
def get_scoring_breakdown(
    league_season_id: UUID,
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
            season = database.require_league_season(cur, league_season_id)
            database.require_member(cur, season["league_id"], current_user)
            database.require_roster_visible(cur, season, user_id, current_user)
        roster = scoring.roster_points_by_contestant(conn, league_season_id, user_id)
        picks = (
            scoring.elimination_pick_results(conn, league_season_id, user_id)
            if is_owner
            else []
        )
        ss_contestant_id, ss_bonus = scoring.sole_survivor_bonus(
            conn, league_season_id, user_id
        )
    return {
        "roster": [
            {"contestant_id": cid, "points": pts} for cid, pts in roster.items()
        ],
        "picks": picks,
        "sole_survivor_contestant_id": ss_contestant_id,
        "sole_survivor_bonus": ss_bonus,
    }
