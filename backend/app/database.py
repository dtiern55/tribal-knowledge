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


def require_season(cur, season_id) -> dict:
    """Fetch the season row or raise 404 — the shared handler preamble."""
    cur.execute("select * from seasons where id = %s", [str(season_id)])
    season = cur.fetchone()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return season
