"""Shared test data helpers. Each function inserts one row and returns it."""

import uuid
from datetime import datetime, timedelta, timezone


def insert_user(conn, display_name="Test User", is_admin=False):
    user_id = uuid.uuid4()
    with conn.cursor() as cur:
        cur.execute(
            "insert into auth.users (id, email, created_at, updated_at)"
            " values (%s, %s, now(), now())",
            [str(user_id), f"{user_id}@test.com"],
        )
        cur.execute(
            "insert into profiles (id, display_name, is_admin)"
            " values (%s, %s, %s) returning *",
            [str(user_id), display_name, is_admin],
        )
        return cur.fetchone()


def insert_season(conn, name="Survivor: Test Island", season_number=99, **kwargs):
    params = {
        "name": name,
        "season_number": season_number,
        "roster_size": kwargs.pop("roster_size", 5),
        "status": kwargs.pop("status", "upcoming"),
        "roster_lock_episode": kwargs.pop("roster_lock_episode", None),
        "merge_episode": kwargs.pop("merge_episode", None),
        "swap_penalty_points": kwargs.pop("swap_penalty_points", -20),
    }
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into seasons
                (name, season_number, roster_size, status,
                 roster_lock_episode, merge_episode, swap_penalty_points)
            values
                (%(name)s, %(season_number)s, %(roster_size)s, %(status)s,
                 %(roster_lock_episode)s, %(merge_episode)s, %(swap_penalty_points)s)
            returning *
            """,
            params,
        )
        return cur.fetchone()


def insert_contestant(conn, season_id, name="Player"):
    with conn.cursor() as cur:
        cur.execute(
            "insert into contestants (season_id, name) values (%s, %s) returning *",
            [str(season_id), name],
        )
        return cur.fetchone()


def insert_episode(
    conn,
    season_id,
    episode_number=1,
    status="upcoming",
    picks_lock_at=None,
    max_elimination_picks=3,
    is_finale=False,
    air_date=None,
):
    if picks_lock_at is None:
        picks_lock_at = datetime.now(timezone.utc) + timedelta(hours=1)
    if air_date is None:
        air_date = "2026-01-01"
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into episodes
                (season_id, episode_number, air_date, max_elimination_picks,
                 is_finale, picks_lock_at, status)
            values (%s, %s, %s, %s, %s, %s, %s)
            returning *
            """,
            [
                str(season_id),
                episode_number,
                air_date,
                max_elimination_picks,
                is_finale,
                picks_lock_at,
                status,
            ],
        )
        return cur.fetchone()


def insert_elimination(conn, episode_id, contestant_id, elimination_type="voted_out"):
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into eliminations (episode_id, contestant_id, elimination_type)
            values (%s, %s, %s) returning *
            """,
            [str(episode_id), str(contestant_id), elimination_type],
        )
        return cur.fetchone()
