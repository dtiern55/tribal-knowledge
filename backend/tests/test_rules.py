import pytest

from tests.helpers import insert_season


@pytest.mark.integration
def test_rules_returns_current_rule_capability(client, db_conn, current_user):
    season = insert_season(db_conn, swap_token_cost=30, token_economy_enabled=False)
    r = client.get(f"/seasons/{season['id']}/rules")
    assert r.status_code == 200
    data = r.json()
    assert data["season"]["id"] == str(season["id"])
    assert data["season"]["swap_token_cost"] == 30
    assert data["season"]["token_economy_enabled"] is False

    # scoring events carry their values (seeded config)
    by_type = {e["event_type"]: e for e in data["scoring_events"]}
    assert by_type["win_individual_immunity"]["point_value"] == 15
    assert by_type["votes_received"]["is_per_unit"] is True
    # Placement scores like any other contestant event now, not as a prediction.
    assert by_type["won_season"]["point_value"] == 50
    assert by_type["made_final_tribal"]["point_value"] == 30
    assert by_type["go_on_journey"]["point_value"] == 4
    assert by_type["play_other_advantage"]["point_value"] == 8
    assert by_type["play_idol"]["point_value"] == 10
    assert by_type["votes_blocked_by_idol"]["point_value"] == 2
    assert by_type["votes_blocked_by_idol"]["is_per_unit"] is True
    assert by_type["idol_played_successfully"]["point_value"] == 5
    assert by_type["episode_title_quote"]["point_value"] == 3
    assert by_type["read_treemail_or_instructions"]["point_value"] == 3
    assert by_type["read_treemail_or_instructions"]["is_per_unit"] is True
    assert by_type["jeff_thats_how_you_do_it"]["point_value"] == 5
    assert by_type["play_idol_nullifier"]["point_value"] == 15
    assert by_type["fake_idol_played"]["point_value"] == 12
    assert "use_extra_vote" not in by_type
    assert "use_steal_a_vote" not in by_type

    pred = {p["key"]: p for p in data["prediction_scores"]}
    assert pred["correct_elimination"]["point_value"] == 16
    assert pred["correct_elimination"]["postmerge_point_value"] == 20
    assert pred["correct_winner_vote"]["point_value"] == 40
    assert pred["correct_early_boot"]["point_value"] == 24
    assert pred["correct_fire_loss"]["point_value"] == 24
    assert "sole_survivor_win" not in pred

    adv = {a["advantage_type"] for a in data["advantages"]}
    assert "double_vote_points" in adv
    assert "extra_vote" not in adv
    assert "cry_on_camera" not in by_type


@pytest.mark.integration
def test_rules_returns_historical_token_capability(client, db_conn, current_user):
    season = insert_season(db_conn, token_economy_enabled=True)
    r = client.get(f"/seasons/{season['id']}/rules")
    assert r.status_code == 200
    data = r.json()
    assert data["season"]["token_economy_enabled"] is True
    assert "cry_on_camera" in {e["event_type"] for e in data["scoring_events"]}
    assert "extra_vote" in {a["advantage_type"] for a in data["advantages"]}
