import os
from contextlib import contextmanager

import psycopg2
from dotenv import load_dotenv
from fastapi import HTTPException
from psycopg2.extras import RealDictCursor

load_dotenv()


@contextmanager
def get_db():
    # One connection per request, by design: Supabase's transaction pooler
    # (port 6543) is the connection manager, so we don't pool at the app layer.
    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ.get("DB_NAME", "postgres"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ["DB_PASSWORD"],
        cursor_factory=RealDictCursor,
    )
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def lock_user_season(cur, user_id, league_season_id) -> None:
    """Serialize one user's writes within a league-season (issues #110/#113).

    The token-balance and swap-cap guards are read-then-act; without this,
    concurrent requests can both pass the check. Transaction-scoped advisory
    locks release on commit/rollback and are safe through the transaction
    pooler. A hashtext collision across users only queues them needlessly,
    never corrupts.
    """
    cur.execute(
        "select pg_advisory_xact_lock(hashtext(%s || ':' || %s))",
        [str(user_id), str(league_season_id)],
    )


def require_season(cur, season_id) -> dict:
    """Fetch the season row or raise 404 — the shared handler preamble."""
    cur.execute("select * from seasons where id = %s", [str(season_id)])
    season = cur.fetchone()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return season


# One league playing one season (#595): the league's rule knobs plus the
# show fields play code reads (merge, status, schedule). `id` is the
# league-season id; `season_id` is the show. Every play handler starts here.
LEAGUE_SEASON_SQL = """
    select ls.*, l.name as league_name,
           s.name, s.season_number, s.merge_episode, s.status,
           s.elimination_pick_schedule, s.created_at as season_created_at
    from league_seasons ls
    join leagues l on l.id = ls.league_id
    join seasons s on s.id = ls.season_id
"""


def require_league_season(cur, league_season_id) -> dict:
    """Fetch the merged league-season row or raise 404."""
    cur.execute(f"{LEAGUE_SEASON_SQL} where ls.id = %s", [str(league_season_id)])
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Season not found")
    return row


def require_member(cur, league_id, user_id) -> None:
    """403 unless the user belongs to the league (admins always pass)."""
    cur.execute(
        "select 1 from league_members where league_id = %s and user_id = %s"
        " union all select 1 from profiles where id = %s and is_admin",
        [str(league_id), str(user_id), str(user_id)],
    )
    if not cur.fetchone():
        raise HTTPException(status_code=403, detail="Not a member of this league")


def snapshot_scoring_config(cur, season_id) -> None:
    """Copy the global scoring config into the season (#170).

    Completed seasons are time capsules: scoring reads only the season's
    snapshot, so later tuning of the global templates never rewrites history.
    """
    cur.execute(
        """
        insert into season_scoring_event_types
            (season_id, event_type, label, point_value, postmerge_point_value,
             token_value, is_per_unit, enabled)
        select %s, event_type, label, point_value, postmerge_point_value,
               token_value, is_per_unit, enabled
        from scoring_event_types
        """,
        [str(season_id)],
    )
    cur.execute(
        """
        insert into season_prediction_score_types
            (season_id, key, label, point_value, postmerge_point_value)
        select %s, key, label, point_value, postmerge_point_value
        from prediction_score_types
        """,
        [str(season_id)],
    )


def require_roster_visible(cur, ls, user_id, current_user) -> None:
    """403 unless requesting own data or the league-season's roster lock passed.

    The shared visibility rule for another player's roster-derived data
    (roster rows, per-contestant breakdown — issues #83/#160).
    """
    from app.locking import EPISODE_LOCKED_SQL

    if str(user_id) == str(current_user):
        return
    locked = False
    if ls["roster_lock_episode"] is not None:
        cur.execute(
            f"""
            select 1 from episodes
            where season_id = %s and episode_number = %s
              and {EPISODE_LOCKED_SQL}
            """,
            [str(ls["season_id"]), ls["roster_lock_episode"]],
        )
        locked = cur.fetchone() is not None
    if not locked:
        raise HTTPException(
            status_code=403, detail="Rosters are hidden until they lock"
        )
