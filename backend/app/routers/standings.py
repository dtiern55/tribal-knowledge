from uuid import UUID

from fastapi import APIRouter, Depends

from app import database, scoring
from app.auth import get_current_user
from app.schemas import StandingEntry

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
    return entries
