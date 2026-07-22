import pytest

from tests.helpers import insert_season


@pytest.mark.integration
def test_rules_returns_config(client, db_conn, current_user):
    season = insert_season(db_conn, swap_token_cost=30)
    r = client.get(f"/seasons/{season['id']}/rules")
    assert r.status_code == 200
    data = r.json()
    assert data["season"]["id"] == str(season["id"])
    assert data["season"]["swap_token_cost"] == 30

    # scoring events carry their values (seeded config)
    by_type = {e["event_type"]: e for e in data["scoring_events"]}
    assert by_type["win_individual_immunity"]["point_value"] == 15
    assert by_type["votes_received"]["is_per_unit"] is True

    pred = {p["key"]: p for p in data["prediction_scores"]}
    assert pred["sole_survivor_win"]["point_value"] == 20

    adv = {a["advantage_type"] for a in data["advantages"]}
    assert "double_vote_points" in adv
