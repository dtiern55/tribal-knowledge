"""Shared test data helpers. Each function inserts one row and returns it."""

import random
import uuid
from datetime import datetime, timedelta, timezone

from app import database


def default_league(conn) -> dict:
    """The one league every test user and season belongs to unless a test says
    otherwise (#595). Get-or-create; each test rolls back."""
    with conn.cursor() as cur:
        cur.execute("select * from leagues where join_code = 'test-league'")
        league = cur.fetchone()
        if league:
            return league
        cur.execute(
            "insert into leagues (name, join_code)"
            " values ('Test League', 'test-league') returning *"
        )
        return cur.fetchone()


def enroll(conn, league_id, user_id) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "insert into league_members (league_id, user_id) values (%s, %s)"
            " on conflict do nothing",
            [str(league_id), str(user_id)],
        )


def league_season_id(conn, season_id) -> str:
    """The default league's league-season for a show season."""
    with conn.cursor() as cur:
        cur.execute(
            "select ls.id from league_seasons ls join leagues l on l.id = ls.league_id"
            " where ls.season_id = %s and l.join_code = 'test-league'",
            [str(season_id)],
        )
        return str(cur.fetchone()["id"])


def insert_user(conn, display_name="Test User", is_admin=False, is_player=True):
    user_id = uuid.uuid4()
    with conn.cursor() as cur:
        cur.execute(
            "insert into auth.users (id, email, created_at, updated_at)"
            " values (%s, %s, now(), now())",
            [str(user_id), f"{user_id}@test.com"],
        )
        cur.execute(
            "insert into profiles (id, display_name, is_admin, is_player)"
            " values (%s, %s, %s, %s) returning *",
            [str(user_id), display_name, is_admin, is_player],
        )
        user = cur.fetchone()
    enroll(conn, default_league(conn)["id"], user_id)
    return user


def insert_league(conn, name="Test League", join_code=None):
    if join_code is None:
        join_code = f"code-{uuid.uuid4().hex[:8]}"
    with conn.cursor() as cur:
        cur.execute(
            "insert into leagues (name, join_code) values (%s, %s) returning *",
            [name, join_code],
        )
        return cur.fetchone()


def insert_season(conn, name="Survivor: Test Island", season_number=None, **kwargs):
    """A show season the default league plays (#595).

    Returns the show row with the league-season's knobs and `league_season_id`
    merged in: `id` stays the SHOW id so cast/episode helpers keep working;
    play routes take `league_season_id`.
    """
    if season_number is None:
        season_number = random.randint(1000, 9999)
    knobs = {
        "roster_size": kwargs.pop("roster_size", 5),
        "roster_lock_episode": kwargs.pop("roster_lock_episode", None),
        "swap_token_cost": kwargs.pop("swap_token_cost", 30),
        # 0 keeps most existing swap tests on the simple always-charged path;
        # the free-swap tests opt in explicitly (#159).
        "free_swaps": kwargs.pop("free_swaps", 0),
        "swap_penalty_step": kwargs.pop("swap_penalty_step", -5),
        "swap_penalty_floor": kwargs.pop("swap_penalty_floor", -25),
        "swap_lock_episode": kwargs.pop("swap_lock_episode", None),
        "advantage_lock_episode": kwargs.pop("advantage_lock_episode", None),
        "weekly_token_allocation": kwargs.pop("weekly_token_allocation", 10),
        "token_economy_enabled": kwargs.pop("token_economy_enabled", False),
    }
    show = {
        "name": name,
        "season_number": season_number,
        "status": kwargs.pop("status", "upcoming"),
        "merge_episode": kwargs.pop("merge_episode", None),
    }
    assert not kwargs, f"unknown insert_season kwargs: {kwargs}"
    league = default_league(conn)
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into seasons (name, season_number, status, merge_episode)
            values (%(name)s, %(season_number)s, %(status)s, %(merge_episode)s)
            returning *
            """,
            show,
        )
        season = cur.fetchone()
        # Every season carries its scoring snapshot (#170), tests included.
        database.snapshot_scoring_config(cur, season["id"])
        cols = ", ".join(knobs)
        vals = ", ".join(f"%({k})s" for k in knobs)
        cur.execute(
            f"insert into league_seasons (league_id, season_id, {cols})"
            f" values (%(league_id)s, %(season_id)s, {vals}) returning id",
            {**knobs, "league_id": str(league["id"]), "season_id": str(season["id"])},
        )
        ls_id = cur.fetchone()["id"]
    return {**season, **knobs, "league_season_id": ls_id, "league_id": league["id"]}


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
                (user_id, league_season_id, contestant_id, active_from_episode,
                 active_until_episode, swap_penalty_points)
            values (%s, %s, %s, %s, %s, %s) returning *
            """,
            [
                str(user_id),
                league_season_id(conn, season_id),
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
                (user_id, league_season_id, episode_id, advantage_type,
                 target_contestant_id, token_cost)
            values (%s, %s, %s, %s, %s, %s) returning *
            """,
            [
                str(user_id),
                league_season_id(conn, season_id),
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
        cur.execute("select season_id from episodes where id = %s", [str(episode_id)])
        ls_id = league_season_id(conn, cur.fetchone()["season_id"])
        cur.execute(
            """
            insert into elimination_picks
                (user_id, league_season_id, episode_id, contestant_id)
            values (%s, %s, %s, %s) returning *
            """,
            [str(user_id), ls_id, str(episode_id), str(contestant_id)],
        )
        return cur.fetchone()


def insert_finale_prediction(
    conn,
    user_id,
    season_id,
    final_four=None,
    final_three=None,
    winner=None,
):
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into finale_predictions
                (user_id, league_season_id, final_four_contestant_ids,
                 final_three_contestant_ids, winner_contestant_id)
            values (%s, %s, %s::uuid[], %s::uuid[], %s) returning *
            """,
            [
                str(user_id),
                league_season_id(conn, season_id),
                [str(c) for c in (final_four or [])],
                [str(c) for c in (final_three or [])],
                str(winner) if winner else None,
            ],
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
                (user_id, league_season_id, transaction_type, amount)
            values (%s, %s, 'weekly_allocation', %s)
            returning *
            """,
            [str(user_id), league_season_id(conn, season_id), amount],
        )
        return cur.fetchone()


def score_episode(conn, episode_id):
    """Mark an episode scored — the next one only opens once this is done (#11)."""
    with conn.cursor() as cur:
        cur.execute(
            "update episodes set status = 'scored' where id = %s", [str(episode_id)]
        )
