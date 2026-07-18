"""Shared test data helpers. Each function inserts one row and returns it."""

import random
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


def insert_season(conn, name="Survivor: Test Island", season_number=None, **kwargs):
    if season_number is None:
        season_number = random.randint(1000, 9999)
    params = {
        "name": name,
        "season_number": season_number,
        "roster_size": kwargs.pop("roster_size", 5),
        "status": kwargs.pop("status", "upcoming"),
        "roster_lock_episode": kwargs.pop("roster_lock_episode", None),
        "merge_episode": kwargs.pop("merge_episode", None),
        "winner_lock_episode": kwargs.pop("winner_lock_episode", None),
        "swap_penalty_points": kwargs.pop("swap_penalty_points", -20),
        "max_swaps": kwargs.pop("max_swaps", 3),
        "swap_lock_episode": kwargs.pop("swap_lock_episode", None),
        "advantage_lock_episode": kwargs.pop("advantage_lock_episode", None),
        "weekly_token_allocation": kwargs.pop("weekly_token_allocation", 10),
    }
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into seasons
                (name, season_number, roster_size, status,
                 roster_lock_episode, merge_episode, winner_lock_episode,
                 swap_penalty_points, max_swaps, swap_lock_episode,
                 advantage_lock_episode, weekly_token_allocation)
            values
                (%(name)s, %(season_number)s, %(roster_size)s, %(status)s,
                 %(roster_lock_episode)s, %(merge_episode)s,
                 %(winner_lock_episode)s, %(swap_penalty_points)s,
                 %(max_swaps)s, %(swap_lock_episode)s,
                 %(advantage_lock_episode)s, %(weekly_token_allocation)s)
            returning *
            """,
            params,
        )
        return cur.fetchone()


def insert_contestant(conn, season_id, name="Player", placement=None):
    with conn.cursor() as cur:
        cur.execute(
            "insert into contestants (season_id, name, placement)"
            " values (%s, %s, %s) returning *",
            [str(season_id), name, placement],
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


def insert_roster_pick(
    conn,
    user_id,
    season_id,
    contestant_id,
    active_from_episode=1,
    active_until_episode=None,
    swap_penalty_points=0,
):
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into roster_picks
                (user_id, season_id, contestant_id, active_from_episode,
                 active_until_episode, swap_penalty_points)
            values (%s, %s, %s, %s, %s, %s) returning *
            """,
            [
                str(user_id),
                str(season_id),
                str(contestant_id),
                active_from_episode,
                active_until_episode,
                swap_penalty_points,
            ],
        )
        return cur.fetchone()


def insert_advantage_play(
    conn,
    user_id,
    episode_id,
    advantage_type,
    target_contestant_id=None,
    token_cost=0,
    season_id=None,
):
    """episode_id=None inserts an unused inventory row (season_id required)."""
    with conn.cursor() as cur:
        if season_id is None:
            cur.execute(
                "select season_id from episodes where id = %s", [str(episode_id)]
            )
            season_id = cur.fetchone()["season_id"]
        cur.execute(
            """
            insert into advantage_plays
                (user_id, season_id, episode_id, advantage_type,
                 target_contestant_id, token_cost)
            values (%s, %s, %s, %s, %s, %s) returning *
            """,
            [
                str(user_id),
                str(season_id),
                str(episode_id) if episode_id else None,
                advantage_type,
                str(target_contestant_id) if target_contestant_id else None,
                token_cost,
            ],
        )
        return cur.fetchone()


def insert_scoring_event(conn, episode_id, contestant_id, event_type, quantity=1):
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into scoring_events
                (episode_id, contestant_id, event_type, quantity)
            values (%s, %s, %s, %s) returning *
            """,
            [str(episode_id), str(contestant_id), event_type, quantity],
        )
        return cur.fetchone()


def insert_elimination_pick(conn, user_id, episode_id, contestant_id):
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into elimination_picks (user_id, episode_id, contestant_id)
            values (%s, %s, %s) returning *
            """,
            [str(user_id), str(episode_id), str(contestant_id)],
        )
        return cur.fetchone()


def insert_finale_prediction(
    conn,
    user_id,
    season_id,
    early_boot=None,
    fire_loss=None,
    winner=None,
):
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into finale_predictions
                (user_id, season_id, early_boot_contestant_id,
                 fire_loss_contestant_id, winner_contestant_id)
            values (%s, %s, %s, %s, %s) returning *
            """,
            [
                str(user_id),
                str(season_id),
                str(early_boot) if early_boot else None,
                str(fire_loss) if fire_loss else None,
                str(winner) if winner else None,
            ],
        )
        return cur.fetchone()


def insert_winner_pick(conn, user_id, season_id, winner_contestant_id):
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into winner_picks (user_id, season_id, winner_contestant_id)
            values (%s, %s, %s) returning *
            """,
            [str(user_id), str(season_id), str(winner_contestant_id)],
        )
        return cur.fetchone()


def grant_tokens(conn, user_id, season_id, amount=50):
    """Fund a user's token balance directly in the ledger.

    The admin starting-allocation endpoint was removed with the #97 token
    model (#120); tests fund via a plain weekly_allocation row (episode_id
    null, so the per-episode unique index never applies).
    """
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into token_transactions
                (user_id, season_id, transaction_type, amount)
            values (%s, %s, 'weekly_allocation', %s)
            returning *
            """,
            [str(user_id), str(season_id), amount],
        )
        return cur.fetchone()
