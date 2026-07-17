import uuid

import pytest

from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_scoring_event,
    insert_season,
)


@pytest.mark.integration
def test_contestant_performance_not_found(client):
    r = client.get(f"/contestants/{uuid.uuid4()}/performance")
    assert r.status_code == 404


@pytest.mark.integration
def test_contestant_performance(client, db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2)
    c = insert_contestant(db_conn, season["id"], "Star")
    insert_scoring_event(db_conn, ep["id"], c["id"], "win_individual_immunity")  # +15
    insert_elimination(db_conn, ep["id"], c["id"])

    r = client.get(f"/contestants/{c['id']}/performance")
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Star"
    assert data["total_points"] == 15
    assert data["eliminated_in_episode"] == 2
    ep2 = next(e for e in data["episodes"] if e["episode_number"] == 2)
    assert ep2["points"] == 15
    assert ep2["eliminated_type"] == "voted_out"
    assert any("+15" in ev for ev in ep2["events"])
