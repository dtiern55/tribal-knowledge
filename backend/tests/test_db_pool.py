"""The connection pool's own rules (#810): reuse, revive, don't pool a wreck."""

import time

import psycopg2
import pytest

from app import database


class FakeCursor:
    def __init__(self, conn):
        self.conn = conn

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self.conn.checks += 1
        if self.conn.dead:
            raise psycopg2.OperationalError("server closed the connection")


class FakeConn:
    def __init__(self, dead=False):
        self.dead = dead
        self.closed = False
        self.checks = 0
        self.commits = 0
        self.rollbacks = 0
        self.rollback_fails = False

    def cursor(self):
        return FakeCursor(self)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1
        if self.rollback_fails:
            raise psycopg2.OperationalError("connection is gone")


class FakePool:
    def __init__(self, conns):
        self.queue = list(conns)
        self.returned = []
        self.closed_on_return = []

    def getconn(self):
        return self.queue.pop(0)

    def putconn(self, conn, close=False):
        (self.closed_on_return if close else self.returned).append(conn)


@pytest.fixture
def pooled(monkeypatch):
    """Swap the real pool out and hand back the fake for assertions."""

    def install(conns):
        pool = FakePool(conns)
        monkeypatch.setattr(database, "_get_pool", lambda: pool)
        monkeypatch.setattr(database, "_idle_since", {})
        return pool

    return install


def test_a_busy_connection_is_reused_without_a_round_trip(pooled):
    conn = FakeConn()
    pool = pooled([conn])
    with database.get_db() as got:
        assert got is conn
    # Straight back into the pool, and no "select 1" spent checking it.
    assert pool.returned == [conn] and conn.checks == 0 and conn.commits == 1

    # Used again right away: still no check, because it has not been idle.
    pool.queue.append(conn)
    with database.get_db():
        pass
    assert conn.checks == 0


def test_a_rested_connection_is_checked_and_replaced_when_dead(pooled):
    dead, fresh = FakeConn(dead=True), FakeConn()
    pool = pooled([dead, fresh])
    database._idle_since[id(dead)] = time.monotonic() - database._IDLE_CHECK_SECONDS - 1

    with database.get_db() as got:
        assert got is fresh

    # The dead one was checked, then dropped rather than handed to the caller.
    assert dead.checks == 1
    assert pool.closed_on_return == [dead]
    assert pool.returned == [fresh]


def test_a_connection_that_cannot_roll_back_is_not_pooled(pooled):
    conn = FakeConn()
    conn.rollback_fails = True
    pool = pooled([conn])

    with pytest.raises(ValueError):
        with database.get_db():
            raise ValueError("handler blew up")

    assert pool.returned == [] and pool.closed_on_return == [conn]


def test_a_handler_error_alone_keeps_the_connection(pooled):
    """A 404 is not a broken socket — roll back and keep it."""
    conn = FakeConn()
    pool = pooled([conn])

    with pytest.raises(ValueError):
        with database.get_db():
            raise ValueError("not found")

    assert conn.rollbacks == 1 and pool.returned == [conn]
