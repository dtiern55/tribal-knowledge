"""
Test infrastructure for Tribal Knowledge backend.

Integration tests require a running local Supabase instance (`supabase start`).
Mark them with @pytest.mark.integration.

Convention: all app code must call get_db() via the module reference
(`database.get_db()`, not `from app.database import get_db`) so that
monkeypatching in the `client` fixture takes effect.
"""

import os
from contextlib import contextmanager
from pathlib import Path

import psycopg2
import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient
from psycopg2.extras import RealDictCursor

load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env.test", override=True)

import app.database as database_module  # noqa: E402 — must follow dotenv load
from app.main import app  # noqa: E402


@pytest.fixture(scope="function")
def db_conn():
    """Psycopg2 connection to local Supabase. Rolls back after each test."""
    conn = psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", "5433")),
        dbname=os.environ.get("DB_NAME", "postgres"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ["DB_PASSWORD"],
        cursor_factory=RealDictCursor,
    )
    conn.autocommit = False
    try:
        yield conn
    finally:
        conn.rollback()
        conn.close()


@pytest.fixture(scope="function")
def client(monkeypatch, db_conn):
    """FastAPI TestClient wired to the test DB connection."""

    @contextmanager
    def _get_db():
        yield db_conn

    monkeypatch.setattr(database_module, "get_db", _get_db)
    with TestClient(app) as c:
        yield c
