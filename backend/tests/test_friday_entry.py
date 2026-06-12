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
def test_set_eliminations_replaces_existing(client, db_conn):
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
    assert len(result) == 1
    assert result[0]["contestant_id"] == str(c2["id"])


@pytest.mark.integration
def test_set_eliminations_empty_clears(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    client.post(
        f"/episodes/{ep['id']}/eliminations",
        json=[{"contestant_id": str(c["id"]), "elimination_type": "voted_out"}],
    )
    r = client.post(f"/episodes/{ep['id']}/eliminations", json=[])
    assert r.status_code == 200
    assert r.json() == []


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
    assert "prior episode" in r.json()["detail"]


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
def test_set_scoring_events_replaces_existing(client, db_conn):
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
    assert len(result) == 1
    assert result[0]["event_type"] == "win_individual_reward"


@pytest.mark.integration
def test_set_scoring_events_empty_clears(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    c = insert_contestant(db_conn, season["id"])
    client.post(
        f"/episodes/{ep['id']}/scoring-events",
        json=[{"contestant_id": str(c["id"]), "event_type": "win_individual_immunity"}],
    )
    r = client.post(f"/episodes/{ep['id']}/scoring-events", json=[])
    assert r.status_code == 200
    assert r.json() == []


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
