import os
import threading
import time
from contextlib import contextmanager

import psycopg2
from dotenv import load_dotenv
from fastapi import HTTPException
from psycopg2 import pool as psycopg2_pool
from psycopg2.extras import RealDictCursor

load_dotenv()

# Opening a connection to the Supabase pooler costs ~145ms; the query that
# follows it usually costs ~25ms. A connection per request meant every endpoint
# paid that handshake before doing any work — about 85% of a warm request
# (#810). Connections are kept per process and reused instead.
#
# This is still the transaction pooler's job on the server side: it manages how
# many *server* connections exist. What changed is that we stop re-opening the
# client side of that link on every call.
_POOL_MAX = int(os.environ.get("DB_POOL_MAX", "10"))
# How long a pooled connection may sit before it is checked with a round trip
# rather than trusted. A busy stretch never pays for the check; the first
# request after a quiet one pays ~25ms instead of a ~145ms fresh handshake.
_IDLE_CHECK_SECONDS = 60

_pool: psycopg2_pool.ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()
# Connection id -> when it went back in the pool. Plain dict: set and pop are
# atomic, and a miss only means "check it", which is the safe answer.
_idle_since: dict[int, float] = {}


def _connect_kwargs() -> dict:
    return dict(
        host=os.environ["DB_HOST"],
        port=os.environ.get("DB_PORT", "5432"),
        dbname=os.environ.get("DB_NAME", "postgres"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ["DB_PASSWORD"],
        cursor_factory=RealDictCursor,
        # Keep the socket warm through idle stretches, so the far end has less
        # reason to drop it between requests.
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=3,
    )


def _get_pool() -> psycopg2_pool.ThreadedConnectionPool:
    """The process's connection pool, opened on first use."""
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                _pool = psycopg2_pool.ThreadedConnectionPool(
                    1, _POOL_MAX, **_connect_kwargs()
                )
    return _pool


def _usable(conn) -> bool:
    """Is this connection still good? Only asked of one that has been idle."""
    if conn.closed:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute("select 1")
        return True
    except psycopg2.Error:
        return False


def _checkout():
    """A connection that is ready to use, and the pool to return it to."""
    pool = _get_pool()
    # Each dead connection is dropped and another tried; a freshly opened one
    # has no idle record, so this settles immediately rather than spinning.
    for _ in range(3):
        conn = pool.getconn()
        idle_since = _idle_since.pop(id(conn), None)
        rested = idle_since is not None and (
            time.monotonic() - idle_since >= _IDLE_CHECK_SECONDS
        )
        if not rested or _usable(conn):
            return pool, conn
        pool.putconn(conn, close=True)
    raise HTTPException(status_code=503, detail="Database unavailable")


@contextmanager
def get_db():
    pool, conn = _checkout()
    broken = False
    try:
        yield conn
        conn.commit()
    except Exception:
        broken = True
        try:
            conn.rollback()
            broken = False
        except psycopg2.Error:
            # A connection that cannot even roll back is finished; closing it
            # keeps the next request from inheriting the mess.
            pass
        raise
    finally:
        if broken:
            pool.putconn(conn, close=True)
        else:
            _idle_since[id(conn)] = time.monotonic()
            pool.putconn(conn)


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
