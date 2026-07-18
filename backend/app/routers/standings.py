from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database, scoring
from app.auth import get_current_user
from app.schemas import ScoringBreakdown, StandingEntry

router = APIRouter(tags=["standings"])


@router.get("/seasons/{season_id}/standings", response_model=list[StandingEntry])
def get_standings(season_id: UUID, _: UUID = Depends(get_current_user)):
    """Live leaderboard: every league member's points for the season.

    Sums the four scoring components per user. Computed live, never cached.
    Ordered by total descending, then display name.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            # Admin/service accounts (e.g. Producer) never compete — issue #50.
            cur.execute(
                "select id::text as id, display_name from profiles"
                " where not is_admin"
            )
            profiles = cur.fetchall()

        roster = scoring.roster_points(conn, season_id)
        elimination = scoring.elimination_points(conn, season_id)
        winner = scoring.winner_points(conn, season_id)
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

    entries = []
    for p in profiles:
        uid = p["id"]
        r = roster.get(uid, 0)
        e = elimination.get(uid, 0)
        w = winner.get(uid, 0)
        f = finale.get(uid, 0)
        entries.append(
            StandingEntry(
                user_id=uid,
                display_name=p["display_name"],
                roster_points=r,
                elimination_points=e,
                winner_points=w,
                finale_points=f,
                total_points=r + e + w + f,
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

    Owner-only: the granular breakdown behind the My Season expanders is
    yours alone. High-level totals stay in /standings, which is public.
    """
    if str(user_id) != str(current_user):
        raise HTTPException(status_code=403, detail="Breakdown is owner-only")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
        roster = scoring.roster_points_by_contestant(conn, season_id, user_id)
        picks = scoring.elimination_pick_results(conn, season_id, user_id)
    return {
        "roster": [
            {"contestant_id": cid, "points": pts} for cid, pts in roster.items()
        ],
        "picks": picks,
    }
