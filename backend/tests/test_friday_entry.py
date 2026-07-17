"""Integration tests for the Friday entry job: eliminations + scoring events."""

import uuid

import pytest

from tests.helpers import insert_contestant, insert_episode, insert_season


@pytest.mark.integration
def test_get_eliminations_empty(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    r = client.get(f"/episodes/{ep['id']}/eliminations")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_get_eliminations_episode_not_found(client):
    r = client.get(f"/episodes/{uuid.uuid4()}/eliminations")
    assert r.status_code == 404


@pytest.mark.integration
def test_set_eliminations(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/eliminations",
        json=[{"contestant_id": str(c["id"]), "elimination_type": "voted_out"}],
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["contestant_id"] == str(c["id"])
    assert r.json()[0]["elimination_type"] == "voted_out"


@pytest.mark.integration
def test_set_eliminations_appears_in_get(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    client.post(
        f"/episodes/{ep['id']}/eliminations",
        json=[{"contestant_id": str(c["id"]), "elimination_type": "voted_out"}],
    )
    r = client.get(f"/episodes/{ep['id']}/eliminations")
    assert r.status_code == 200
    assert len(r.json()) == 1


@pytest.mark.integration
def test_set_eliminations_appends(client, db_conn):
    """Additive (#71): a second POST adds, it does not replace."""
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    client.post(
        f"/episodes/{ep['id']}/eliminations",
        json=[{"contestant_id": str(c1["id"]), "elimination_type": "voted_out"}],
    )
    r = client.post(
        f"/episodes/{ep['id']}/eliminations",
        json=[{"contestant_id": str(c2["id"]), "elimination_type": "quit"}],
    )
    assert r.status_code == 200
    result = client.get(f"/episodes/{ep['id']}/eliminations").json()
    assert {row["contestant_id"] for row in result} == {str(c1["id"]), str(c2["id"])}


@pytest.mark.integration
def test_set_eliminations_rejects_duplicate(client, db_conn):
    """Additive (#71): can't eliminate the same contestant twice."""
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    client.post(
        f"/episodes/{ep['id']}/eliminations",
        json=[{"contestant_id": str(c["id"]), "elimination_type": "voted_out"}],
    )
    r = client.post(
        f"/episodes/{ep['id']}/eliminations",
        json=[{"contestant_id": str(c["id"]), "elimination_type": "voted_out"}],
    )
    assert r.status_code == 400
    assert "already eliminated" in r.json()["detail"]


@pytest.mark.integration
def test_delete_elimination(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    created = client.post(
        f"/episodes/{ep['id']}/eliminations",
        json=[{"contestant_id": str(c["id"]), "elimination_type": "voted_out"}],
    ).json()
    r = client.delete(f"/eliminations/{created[0]['id']}")
    assert r.status_code == 204
    assert client.get(f"/episodes/{ep['id']}/eliminations").json() == []


@pytest.mark.integration
def test_set_eliminations_episode_not_found(client):
    r = client.post(
        f"/episodes/{uuid.uuid4()}/eliminations",
        json=[{"contestant_id": str(uuid.uuid4()), "elimination_type": "voted_out"}],
    )
    assert r.status_code == 404


@pytest.mark.integration
def test_set_eliminations_contestant_not_in_season(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/eliminations",
        json=[{"contestant_id": str(uuid.uuid4()), "elimination_type": "voted_out"}],
    )
    assert r.status_code == 400
    assert "not in this season" in r.json()["detail"]


@pytest.mark.integration
def test_set_eliminations_duplicate_contestants(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/eliminations",
        json=[
            {"contestant_id": str(c["id"]), "elimination_type": "voted_out"},
            {"contestant_id": str(c["id"]), "elimination_type": "voted_out"},
        ],
    )
    assert r.status_code == 400
    assert "Duplicate" in r.json()["detail"]


@pytest.mark.integration
def test_set_eliminations_already_eliminated_prior_episode(client, db_conn):
    season = insert_season(db_conn)
    ep1 = insert_episode(db_conn, season["id"], episode_number=1)
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    c = insert_contestant(db_conn, season["id"])
    client.post(
        f"/episodes/{ep1['id']}/eliminations",
        json=[{"contestant_id": str(c["id"]), "elimination_type": "voted_out"}],
    )
    r = client.post(
        f"/episodes/{ep2['id']}/eliminations",
        json=[{"contestant_id": str(c["id"]), "elimination_type": "voted_out"}],
    )
    assert r.status_code == 400
    assert "already eliminated" in r.json()["detail"]


# --- Scoring events ---


@pytest.mark.integration
def test_get_scoring_events_empty(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    r = client.get(f"/episodes/{ep['id']}/scoring-events")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_get_scoring_events_episode_not_found(client):
    r = client.get(f"/episodes/{uuid.uuid4()}/scoring-events")
    assert r.status_code == 404


@pytest.mark.integration
def test_set_scoring_events(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "win_individual_immunity"}],
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["event_type"] == "win_individual_immunity"
    assert r.json()[0]["quantity"] == 1


@pytest.mark.integration
def test_set_scoring_events_with_quantity_and_notes(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[
            {
                "contestant_id": str(c["id"]),
                "event_type": "votes_received",
                "quantity": 4,
                "notes": "revote",
            }
        ],
    )
    assert r.status_code == 200
    data = r.json()[0]
    assert data["quantity"] == 4
    assert data["notes"] == "revote"


@pytest.mark.integration
def test_set_scoring_events_appends(client, db_conn):
    """Additive (#71): a second POST adds — it does NOT wipe the first.

    This is the exact practice-season-2 bug: recording points then tokens in
    two calls used to erase the points.
    """
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "win_individual_immunity"}],
    )
    r = client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "win_individual_reward"}],
    )
    assert r.status_code == 200
    result = client.get(f"/episodes/{ep['id']}/scoring-events").json()
    assert {row["event_type"] for row in result} == {
        "win_individual_immunity",
        "win_individual_reward",
    }


@pytest.mark.integration
def test_delete_scoring_event(client, db_conn):
    """DELETE removes one event (token reversal covered in test_tokens)."""
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    created = client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "win_individual_immunity"}],
    ).json()
    r = client.delete(f"/scoring-events/{created[0]['id']}")
    assert r.status_code == 204
    assert client.get(f"/episodes/{ep['id']}/scoring-events").json() == []


@pytest.mark.integration
def test_set_scoring_events_episode_not_found(client):
    r = client.post(
        f"/episodes/{uuid.uuid4()}/scoring-events",
        json=[
            {
                "contestant_id": str(uuid.uuid4()),
                "event_type": "win_individual_immunity",
            }
        ],  # noqa: E501
    )
    assert r.status_code == 404


@pytest.mark.integration
def test_set_scoring_events_contestant_not_in_season(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[
            {
                "contestant_id": str(uuid.uuid4()),
                "event_type": "win_individual_immunity",
            }
        ],  # noqa: E501
    )
    assert r.status_code == 400
    assert "not in this season" in r.json()["detail"]


@pytest.mark.integration
def test_set_scoring_events_invalid_event_type(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "not_a_real_event"}],
    )
    assert r.status_code == 400
    assert "Unknown event types" in r.json()["detail"]
