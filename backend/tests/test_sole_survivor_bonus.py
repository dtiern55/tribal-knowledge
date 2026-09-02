"""Sole Survivor pays +50% of the designee's finale total, added once (#164).

The rounding matters: applying 1.5 per event row would round each row and stop
reconciling with the per-episode breakdown.
"""

import pytest

from app import scoring
from tests import helpers

pytestmark = pytest.mark.integration


def _season_with_finale(db_conn):
    season = helpers.insert_season(db_conn, roster_lock_episode=1, status="active")
    ep = helpers.insert_episode(
        db_conn, season["id"], episode_number=1, status="scored", is_finale=True
    )
    return season, ep


def test_bonus_is_half_the_finale_total_rounded_half_up(db_conn):
    season, ep = _season_with_finale(db_conn)
    user = helpers.insert_user(db_conn)
    c = helpers.insert_contestant(db_conn, season["id"], name="Winner")
    helpers.insert_roster_pick(db_conn, user["id"], season["id"], c["id"])
    # 3 + 3 + 3 = 9 base -> +4.5 -> rounds to +5, total 14.
    for _ in range(3):
        helpers.insert_scoring_event(
            db_conn, ep["id"], c["id"], "vote_correctly_at_tribal"
        )

    assert (
        scoring.roster_points(db_conn, season["league_season_id"])[str(user["id"])] == 9
    )

    with db_conn.cursor() as cur:
        cur.execute(
            "update roster_picks set is_sole_survivor = true"
            " where user_id = %s and contestant_id = %s",
            [str(user["id"]), str(c["id"])],
        )
    assert (
        scoring.roster_points(db_conn, season["league_season_id"])[str(user["id"])]
        == 14
    )


def test_bonus_helper_names_the_designee_and_amount(db_conn):
    """scoring.sole_survivor_bonus pulls the bonus out for display (contestant, pts)."""
    season, ep = _season_with_finale(db_conn)
    user = helpers.insert_user(db_conn)
    c = helpers.insert_contestant(db_conn, season["id"], name="Winner")
    helpers.insert_roster_pick(db_conn, user["id"], season["id"], c["id"])
    for _ in range(3):
        helpers.insert_scoring_event(
            db_conn, ep["id"], c["id"], "vote_correctly_at_tribal"
        )
    # On the roster but not designated -> no bonus.
    assert scoring.sole_survivor_bonus(
        db_conn, season["league_season_id"], user["id"]
    ) == (None, 0)

    with db_conn.cursor() as cur:
        cur.execute(
            "update roster_picks set is_sole_survivor = true"
            " where user_id = %s and contestant_id = %s",
            [str(user["id"]), str(c["id"])],
        )
    # 9 finale points -> +4.5 -> +5, named on the designee.
    assert scoring.sole_survivor_bonus(
        db_conn, season["league_season_id"], user["id"]
    ) == (
        str(c["id"]),
        5,
    )


def test_only_the_designee_and_only_the_finale(db_conn):
    season = helpers.insert_season(db_conn, roster_lock_episode=1, status="active")
    early = helpers.insert_episode(
        db_conn, season["id"], episode_number=1, status="scored"
    )
    fin = helpers.insert_episode(
        db_conn, season["id"], episode_number=2, status="scored", is_finale=True
    )
    user = helpers.insert_user(db_conn)
    designee = helpers.insert_contestant(db_conn, season["id"], name="Designee")
    other = helpers.insert_contestant(db_conn, season["id"], name="Other")
    for c in (designee, other):
        helpers.insert_roster_pick(db_conn, user["id"], season["id"], c["id"])
    # Designee scores in both episodes; only the finale half is boosted.
    helpers.insert_scoring_event(
        db_conn, early["id"], designee["id"], "win_individual_immunity"
    )
    helpers.insert_scoring_event(
        db_conn, fin["id"], designee["id"], "win_individual_immunity"
    )
    helpers.insert_scoring_event(
        db_conn, fin["id"], other["id"], "win_individual_immunity"
    )
    with db_conn.cursor() as cur:
        cur.execute(
            "update roster_picks set is_sole_survivor = true"
            " where user_id = %s and contestant_id = %s",
            [str(user["id"]), str(designee["id"])],
        )
    # 15 (early) + 15 (finale) + 15 (other) = 45, plus half of the designee's
    # finale 15 = 7.5 -> 8.
    assert (
        scoring.roster_points(db_conn, season["league_season_id"])[str(user["id"])]
        == 53
    )
