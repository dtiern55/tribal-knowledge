import pytest

from app import scoring
from tests.helpers import (
    insert_advantage_play,
    insert_contestant,
    insert_elimination,
    insert_elimination_pick,
    insert_episode,
    insert_finale_prediction,
    insert_roster_pick,
    insert_scoring_event,
    insert_season,
    insert_user,
)

# --- roster_points ---


@pytest.mark.integration
def test_roster_points_basic(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2)
    user = insert_user(db_conn)
    contestant = insert_contestant(db_conn, season["id"])
    insert_roster_pick(db_conn, user["id"], season["id"], contestant["id"])
    insert_scoring_event(db_conn, ep["id"], contestant["id"], "win_individual_immunity")

    assert scoring.roster_points(db_conn, season["id"]) == {str(user["id"]): 15}


@pytest.mark.integration
def test_votes_received_scores_zero(db_conn):
    """Receiving votes at tribal costs no points (decision 2026-07-18) — pre
    and post-merge alike. Still recorded (per-unit) for castaway-page context.
    """
    season = insert_season(db_conn, merge_episode=7)
    pre = insert_episode(db_conn, season["id"], episode_number=3)
    post = insert_episode(db_conn, season["id"], episode_number=8)
    user = insert_user(db_conn)
    c = insert_contestant(db_conn, season["id"])
    insert_roster_pick(db_conn, user["id"], season["id"], c["id"])
    insert_scoring_event(db_conn, pre["id"], c["id"], "votes_received", quantity=2)
    insert_scoring_event(db_conn, post["id"], c["id"], "votes_received", quantity=3)

    assert scoring.roster_points(db_conn, season["id"]) == {str(user["id"]): 0}


@pytest.mark.integration
def test_roster_points_respects_active_range(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    ep5 = insert_episode(db_conn, season["id"], episode_number=5)
    user = insert_user(db_conn)
    c = insert_contestant(db_conn, season["id"])
    # rostered only for episodes 2-3, then swapped out (penalty -20)
    insert_roster_pick(
        db_conn,
        user["id"],
        season["id"],
        c["id"],
        active_from_episode=2,
        active_until_episode=3,
        swap_penalty_points=-20,
    )
    insert_scoring_event(db_conn, ep2["id"], c["id"], "win_individual_immunity")  # 15
    insert_scoring_event(db_conn, ep5["id"], c["id"], "win_individual_immunity")  # out

    # ep2 counts (+15), ep5 is outside the active range, plus -20 swap penalty
    assert scoring.roster_points(db_conn, season["id"]) == {str(user["id"]): -5}


@pytest.mark.integration
def test_roster_points_same_contestant_two_users(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2)
    u1 = insert_user(db_conn, display_name="A")
    u2 = insert_user(db_conn, display_name="B")
    c = insert_contestant(db_conn, season["id"])
    insert_roster_pick(db_conn, u1["id"], season["id"], c["id"])
    insert_roster_pick(db_conn, u2["id"], season["id"], c["id"])
    insert_scoring_event(db_conn, ep["id"], c["id"], "win_individual_immunity")

    result = scoring.roster_points(db_conn, season["id"])
    assert result == {str(u1["id"]): 15, str(u2["id"]): 15}


@pytest.mark.integration
def test_roster_points_doubled_by_advantage(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2)
    user = insert_user(db_conn)
    c = insert_contestant(db_conn, season["id"])
    insert_roster_pick(db_conn, user["id"], season["id"], c["id"])
    insert_scoring_event(db_conn, ep["id"], c["id"], "win_individual_immunity")
    insert_advantage_play(
        db_conn, user["id"], ep["id"], "double_roster_points", c["id"]
    )

    assert scoring.roster_points(db_conn, season["id"]) == {str(user["id"]): 30}


@pytest.mark.integration
def test_roster_points_double_only_matching_episode(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    user = insert_user(db_conn)
    c = insert_contestant(db_conn, season["id"])
    insert_roster_pick(db_conn, user["id"], season["id"], c["id"])
    insert_scoring_event(db_conn, ep2["id"], c["id"], "win_individual_immunity")
    insert_scoring_event(db_conn, ep3["id"], c["id"], "win_individual_immunity")
    # Double only applies to ep3
    insert_advantage_play(
        db_conn, user["id"], ep3["id"], "double_roster_points", c["id"]
    )

    # ep2: 15, ep3: 30 -> 45
    assert scoring.roster_points(db_conn, season["id"]) == {str(user["id"]): 45}


@pytest.mark.integration
def test_roster_points_includes_placement(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    insert_episode(db_conn, season["id"], episode_number=13, is_finale=True)
    user = insert_user(db_conn)
    winner = insert_contestant(db_conn, season["id"], "Winner", placement=1)
    insert_roster_pick(db_conn, user["id"], season["id"], winner["id"])

    # Rostering the Sole Survivor at the finale -> +30 (issue #87).
    assert scoring.roster_points(db_conn, season["id"]) == {str(user["id"]): 30}


@pytest.mark.integration
def test_placement_points_only_if_active_at_finale(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    insert_episode(db_conn, season["id"], episode_number=13, is_finale=True)
    user = insert_user(db_conn)
    runner = insert_contestant(db_conn, season["id"], "RunnerUp", placement=2)
    # Swapped this contestant off the roster before the finale -> no placement pts.
    insert_roster_pick(
        db_conn, user["id"], season["id"], runner["id"], active_until_episode=5
    )

    # Total stays 0 (no placement bonus); would be +20 if it counted.
    assert scoring.roster_points(db_conn, season["id"]) == {str(user["id"]): 0}


@pytest.mark.integration
def test_episode_points_reconciles_with_standings(db_conn):
    # Summing episode_points over every episode equals the standings total —
    # the invariant the trend arrow relies on.
    season = insert_season(db_conn, merge_episode=7)
    user = insert_user(db_conn)
    c = insert_contestant(db_conn, season["id"])
    other = insert_contestant(db_conn, season["id"], "Other")
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    ep3 = insert_episode(db_conn, season["id"], episode_number=3)
    insert_roster_pick(db_conn, user["id"], season["id"], c["id"])
    insert_scoring_event(db_conn, ep2["id"], c["id"], "win_individual_immunity")  # +15
    insert_scoring_event(db_conn, ep3["id"], c["id"], "win_individual_reward")  # +12
    insert_elimination_pick(db_conn, user["id"], ep3["id"], other["id"])
    insert_elimination(db_conn, ep3["id"], other["id"])  # correct -> +15

    uid = str(user["id"])
    total = scoring.roster_points(db_conn, season["id"]).get(
        uid, 0
    ) + scoring.elimination_points(db_conn, season["id"]).get(uid, 0)
    summed = sum(
        scoring.episode_points(db_conn, season["id"], n).get(uid, 0) for n in (2, 3)
    )
    assert summed == total == 42


@pytest.mark.integration
def test_episode_points_finale_includes_outcomes(db_conn):
    # The finale delta folds in roster-placement points (they resolve then).
    season = insert_season(db_conn, merge_episode=3)
    user = insert_user(db_conn)
    winner = insert_contestant(db_conn, season["id"], "Winner", placement=1)
    insert_episode(db_conn, season["id"], episode_number=6, is_finale=True)
    insert_roster_pick(db_conn, user["id"], season["id"], winner["id"])

    # Rostering the placement-1 finisher pays made_final_tribal +10 and
    # sole_survivor_win +20.
    assert scoring.episode_points(db_conn, season["id"], 6) == {str(user["id"]): 30}


# --- elimination_points ---


@pytest.mark.integration
def test_elimination_points_correct_premerge(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=3)
    user = insert_user(db_conn)
    c = insert_contestant(db_conn, season["id"])
    insert_elimination_pick(db_conn, user["id"], ep["id"], c["id"])
    insert_elimination(db_conn, ep["id"], c["id"])

    assert scoring.elimination_points(db_conn, season["id"]) == {str(user["id"]): 15}


@pytest.mark.integration
def test_elimination_points_correct_postmerge(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=9)
    user = insert_user(db_conn)
    c = insert_contestant(db_conn, season["id"])
    insert_elimination_pick(db_conn, user["id"], ep["id"], c["id"])
    insert_elimination(db_conn, ep["id"], c["id"])

    assert scoring.elimination_points(db_conn, season["id"]) == {str(user["id"]): 18}


@pytest.mark.integration
def test_elimination_points_wrong_pick_scores_nothing(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=3)
    user = insert_user(db_conn)
    picked = insert_contestant(db_conn, season["id"], "Picked")
    eliminated = insert_contestant(db_conn, season["id"], "Eliminated")
    insert_elimination_pick(db_conn, user["id"], ep["id"], picked["id"])
    insert_elimination(db_conn, ep["id"], eliminated["id"])

    assert scoring.elimination_points(db_conn, season["id"]) == {}


@pytest.mark.integration
def test_elimination_points_excludes_finale(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    finale = insert_episode(db_conn, season["id"], episode_number=13, is_finale=True)
    user = insert_user(db_conn)
    c = insert_contestant(db_conn, season["id"])
    # Even a "correct" finale pick (contestant in eliminations) scores nothing
    # here — finale picks are a winner vote, handled separately.
    insert_elimination_pick(db_conn, user["id"], finale["id"], c["id"])
    insert_elimination(
        db_conn, finale["id"], c["id"], elimination_type="fire_making_loss"
    )

    assert scoring.elimination_points(db_conn, season["id"]) == {}


@pytest.mark.integration
def test_elimination_points_doubled_by_advantage(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=3)
    user = insert_user(db_conn)
    c = insert_contestant(db_conn, season["id"])
    insert_elimination_pick(db_conn, user["id"], ep["id"], c["id"])
    insert_elimination(db_conn, ep["id"], c["id"])
    insert_advantage_play(db_conn, user["id"], ep["id"], "double_vote_points", c["id"])

    # pre-merge correct pick 15 -> doubled to 30
    assert scoring.elimination_points(db_conn, season["id"]) == {str(user["id"]): 30}


@pytest.mark.integration
def test_elimination_points_double_wrong_target_no_effect(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=3)
    user = insert_user(db_conn)
    picked = insert_contestant(db_conn, season["id"], "Picked")
    other = insert_contestant(db_conn, season["id"], "Other")
    insert_elimination_pick(db_conn, user["id"], ep["id"], picked["id"])
    insert_elimination(db_conn, ep["id"], picked["id"])
    # Double was played on a different contestant than the actual pick
    insert_advantage_play(
        db_conn, user["id"], ep["id"], "double_vote_points", other["id"]
    )

    assert scoring.elimination_points(db_conn, season["id"]) == {str(user["id"]): 15}


# --- finale_points ---


def _finale_setup(db_conn):
    """Season with a finale, the actual boot/fire/winner outcomes recorded."""
    season = insert_season(db_conn)
    finale = insert_episode(db_conn, season["id"], episode_number=13, is_finale=True)
    boot = insert_contestant(db_conn, season["id"], "Boot", placement=5)
    fire = insert_contestant(db_conn, season["id"], "Fire", placement=4)
    winner = insert_contestant(db_conn, season["id"], "Winner", placement=1)
    insert_elimination(db_conn, finale["id"], boot["id"], elimination_type="voted_out")
    insert_elimination(
        db_conn, finale["id"], fire["id"], elimination_type="fire_making_loss"
    )
    return season, boot, fire, winner


@pytest.mark.integration
def test_finale_points_full_ballot(db_conn):
    season, boot, fire, winner = _finale_setup(db_conn)
    user = insert_user(db_conn)
    insert_finale_prediction(
        db_conn,
        user["id"],
        season["id"],
        early_boot=boot["id"],
        fire_loss=fire["id"],
        winner=winner["id"],
    )

    # 18 + 18 + 30
    assert scoring.finale_points(db_conn, season["id"]) == {str(user["id"]): 66}


@pytest.mark.integration
def test_finale_points_winner_only(db_conn):
    season, boot, fire, winner = _finale_setup(db_conn)
    user = insert_user(db_conn)
    # boot/fire guesses swapped (wrong), winner correct
    insert_finale_prediction(
        db_conn,
        user["id"],
        season["id"],
        early_boot=fire["id"],
        fire_loss=boot["id"],
        winner=winner["id"],
    )

    assert scoring.finale_points(db_conn, season["id"]) == {str(user["id"]): 30}


@pytest.mark.integration
def test_finale_points_all_wrong_scores_nothing(db_conn):
    season, boot, fire, winner = _finale_setup(db_conn)
    runner_up = insert_contestant(db_conn, season["id"], "RunnerUp", placement=2)
    user = insert_user(db_conn)
    insert_finale_prediction(
        db_conn,
        user["id"],
        season["id"],
        early_boot=runner_up["id"],
        fire_loss=runner_up["id"],
        winner=runner_up["id"],
    )

    assert scoring.finale_points(db_conn, season["id"]) == {}


# --- per-user breakdown (My Season, #52) ---


@pytest.mark.integration
def test_roster_points_by_contestant_splits_and_sums(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2)
    user = insert_user(db_conn)
    a = insert_contestant(db_conn, season["id"], "A")
    b = insert_contestant(db_conn, season["id"], "B")
    insert_roster_pick(db_conn, user["id"], season["id"], a["id"])
    # B was swapped out with a penalty and earns nothing
    insert_roster_pick(
        db_conn,
        user["id"],
        season["id"],
        b["id"],
        active_from_episode=1,
        active_until_episode=1,
        swap_penalty_points=-20,
    )
    insert_scoring_event(db_conn, ep["id"], a["id"], "win_individual_immunity")  # 15

    by_c = scoring.roster_points_by_contestant(db_conn, season["id"], user["id"])
    assert by_c == {str(a["id"]): 15, str(b["id"]): -20}
    # Per-contestant sum matches the season-level total (no doubles in play)
    assert (
        sum(by_c.values())
        == scoring.roster_points(db_conn, season["id"])[str(user["id"])]
    )

    # A played Double Roster folds into the breakdown now (#257 reverses #136):
    # the contestant's shown points double, and the per-contestant sum still
    # equals the standings total.
    insert_advantage_play(
        db_conn,
        user["id"],
        ep["id"],
        "double_roster_points",
        target_contestant_id=a["id"],
    )
    by_c = scoring.roster_points_by_contestant(db_conn, season["id"], user["id"])
    assert by_c[str(a["id"])] == 30  # doubled
    total = scoring.roster_points(db_conn, season["id"])[str(user["id"])]
    assert sum(by_c.values()) == total == 10  # 30 doubled - 20 swap


@pytest.mark.integration
def test_elimination_pick_results_hit_and_miss(db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=3)
    user = insert_user(db_conn)
    hit = insert_contestant(db_conn, season["id"], "Hit")
    miss = insert_contestant(db_conn, season["id"], "Miss")
    insert_elimination_pick(db_conn, user["id"], ep["id"], hit["id"])
    insert_elimination_pick(db_conn, user["id"], ep["id"], miss["id"])
    insert_elimination(db_conn, ep["id"], hit["id"])

    results = scoring.elimination_pick_results(db_conn, season["id"], user["id"])
    by_c = {r["contestant_id"]: r for r in results}
    assert by_c[str(hit["id"])]["correct"] is True
    assert by_c[str(hit["id"])]["points"] == 15  # premerge correct_elimination
    assert by_c[str(miss["id"])]["correct"] is False
    assert by_c[str(miss["id"])]["points"] == 0

    # Double Vote must NOT inflate the per-pick display (#136): base points
    # here, the bonus reported separately, standings total still doubled.
    insert_advantage_play(
        db_conn,
        user["id"],
        ep["id"],
        "double_vote_points",
        target_contestant_id=hit["id"],
    )
    results = scoring.elimination_pick_results(db_conn, season["id"], user["id"])
    by_c = {r["contestant_id"]: r for r in results}
    assert by_c[str(hit["id"])]["points"] == 15  # base, not 30
    assert scoring.elimination_points(db_conn, season["id"])[str(user["id"])] == 30


@pytest.mark.integration
def test_scoring_ignores_global_template_changes(db_conn):
    """#170: completed seasons are time capsules — tuning the global template
    after a season exists must not change what that season scores."""
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2)
    user = insert_user(db_conn)
    contestant = insert_contestant(db_conn, season["id"])
    insert_roster_pick(db_conn, user["id"], season["id"], contestant["id"])
    insert_scoring_event(db_conn, ep["id"], contestant["id"], "win_individual_immunity")

    assert scoring.roster_points(db_conn, season["id"]) == {str(user["id"]): 15}

    with db_conn.cursor() as cur:
        cur.execute(
            "update scoring_event_types set point_value = 999"
            " where event_type = 'win_individual_immunity'"
        )
        cur.execute(
            "update prediction_score_types set point_value = 999"
            " where key = 'correct_elimination'"
        )
    try:
        assert scoring.roster_points(db_conn, season["id"]) == {str(user["id"]): 15}
    finally:
        with db_conn.cursor() as cur:
            cur.execute(
                "update scoring_event_types set point_value = 15"
                " where event_type = 'win_individual_immunity'"
            )
            cur.execute(
                "update prediction_score_types set point_value = 15"
                " where key = 'correct_elimination'"
            )
