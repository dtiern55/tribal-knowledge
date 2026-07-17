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
    ev = ep2["events"][0]
    assert ev["label"] == "Win individual immunity"
    assert ev["points"] == 15
    assert ev["token_value"] == 0


@pytest.mark.integration
def test_cast_lists_base_scores(client, db_conn):
    """Cast list returns every contestant with base points, sorted desc (#83)."""
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2)
    star = insert_contestant(db_conn, season["id"], "Star")
    dud = insert_contestant(db_conn, season["id"], "Dud")
    insert_scoring_event(
        db_conn, ep["id"], star["id"], "win_individual_immunity"
    )  # +15
    insert_scoring_event(db_conn, ep["id"], star["id"], "use_extra_vote")  # +10 tkn
    insert_elimination(db_conn, ep["id"], dud["id"])

    cast = client.get(f"/seasons/{season['id']}/cast").json()
    assert [c["name"] for c in cast] == ["Star", "Dud"]  # sorted by points desc
    star_row = cast[0]
    assert star_row["total_points"] == 15
    assert star_row["total_tokens"] == 10
    assert cast[1]["total_points"] == 0
    assert cast[1]["eliminated_in_episode"] == 2


@pytest.mark.integration
def test_contestant_performance_token_only_event(client, db_conn):
    """Token-only events report their token value, not just +0 points (#83)."""
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2)
    c = insert_contestant(db_conn, season["id"], "Star")
    insert_scoring_event(db_conn, ep["id"], c["id"], "use_extra_vote")  # 0 pts / 10 tkn

    r = client.get(f"/contestants/{c['id']}/performance")
    ev = r.json()["episodes"][0]["events"][0]
    assert ev["points"] == 0
    assert ev["token_value"] == 10
