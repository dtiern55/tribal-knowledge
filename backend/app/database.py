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


def lock_user_season(cur, user_id, season_id) -> None:
    """Serialize one user's writes within a season (issues #110/#113).

    The token-balance and swap-cap guards are read-then-act; without this,
    concurrent requests can both pass the check. Transaction-scoped advisory
    locks release on commit/rollback and are safe through the transaction
    pooler. A hashtext collision across users only queues them needlessly,
    never corrupts.
    """
    cur.execute(
        "select pg_advisory_xact_lock(hashtext(%s || ':' || %s))",
        [str(user_id), str(season_id)],
    )


def require_season(cur, season_id) -> dict:
    """Fetch the season row or raise 404 — the shared handler preamble."""
    cur.execute("select * from seasons where id = %s", [str(season_id)])
    season = cur.fetchone()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return season


def require_roster_visible(cur, season, user_id, current_user) -> None:
    """403 unless requesting own data or the season's roster lock has passed.

    The shared visibility rule for another player's roster-derived data
    (roster rows, per-contestant breakdown — issues #83/#160).
    """
    from app.locking import EPISODE_LOCKED_SQL

    if str(user_id) == str(current_user):
        return
    locked = False
    if season["roster_lock_episode"] is not None:
        cur.execute(
            f"""
            select 1 from episodes
            where season_id = %s and episode_number = %s
              and {EPISODE_LOCKED_SQL}
            """,
            [str(season["id"]), season["roster_lock_episode"]],
        )
        locked = cur.fetchone() is not None
    if not locked:
        raise HTTPException(
            status_code=403, detail="Rosters are hidden until they lock"
        )
