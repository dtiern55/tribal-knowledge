import uuid
from datetime import datetime, timezone

import pytest
from psycopg2 import errors as pg_errors

from tests.helpers import insert_contestant, insert_episode, insert_season

# --- seasons ---


@pytest.mark.integration
def test_create_season(client):
    r = client.post("/seasons", json={"name": "Survivor: X", "season_number": 50})
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Survivor: X"
    assert data["season_number"] == 50
    assert data["roster_size"] == 5  # default
    assert data["status"] == "upcoming"


@pytest.mark.integration
def test_create_season_duplicate_number(client, db_conn):
    insert_season(db_conn, season_number=50)
    r = client.post("/seasons", json={"name": "Dup", "season_number": 50})
    assert r.status_code == 409


@pytest.mark.integration
def test_create_season_bad_roster_size(client):
    r = client.post(
        "/seasons",
        json={"name": "X", "season_number": 51, "roster_size": 99},
    )
    assert r.status_code == 422  # pydantic le=10


@pytest.mark.integration
def test_update_season(client, db_conn):
    season = insert_season(db_conn)
    r = client.patch(
        f"/seasons/{season['id']}",
        json={"roster_lock_episode": 2, "status": "active"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["roster_lock_episode"] == 2
    assert data["status"] == "active"


@pytest.mark.integration
def test_update_season_not_found(client):
    r = client.patch(f"/seasons/{uuid.uuid4()}", json={"status": "active"})
    assert r.status_code == 404


@pytest.mark.integration
def test_update_season_empty_body(client, db_conn):
    season = insert_season(db_conn)
    r = client.patch(f"/seasons/{season['id']}", json={})
    assert r.status_code == 400


# --- contestants ---


@pytest.mark.integration
def test_create_contestants_bulk(client, db_conn):
    season = insert_season(db_conn)
    r = client.post(
        f"/seasons/{season['id']}/contestants",
        json={"names": ["Alice", "Bob", "Carol"]},
    )
    assert r.status_code == 201
    assert len(r.json()) == 3
    listed = client.get(f"/seasons/{season['id']}/contestants").json()
    assert {c["name"] for c in listed} == {"Alice", "Bob", "Carol"}


@pytest.mark.integration
def test_create_contestants_duplicate_in_request(client, db_conn):
    season = insert_season(db_conn)
    r = client.post(
        f"/seasons/{season['id']}/contestants",
        json={"names": ["Alice", "Alice"]},
    )
    assert r.status_code == 400


@pytest.mark.integration
def test_create_contestants_existing_name(client, db_conn):
    season = insert_season(db_conn)
    insert_contestant(db_conn, season["id"], "Alice")
    r = client.post(
        f"/seasons/{season['id']}/contestants",
        json={"names": ["Alice", "Bob"]},
    )
    assert r.status_code == 409


@pytest.mark.integration
def test_create_contestants_season_not_found(client):
    r = client.post(
        f"/seasons/{uuid.uuid4()}/contestants",
        json={"names": ["Alice"]},
    )
    assert r.status_code == 404


@pytest.mark.integration
def test_update_contestant_placement(client, db_conn):
    season = insert_season(db_conn)
    c = insert_contestant(db_conn, season["id"], "Alice")
    r = client.patch(f"/contestants/{c['id']}", json={"placement": 1})
    assert r.status_code == 200
    assert r.json()["placement"] == 1


@pytest.mark.integration
def test_update_contestant_image_url(client, db_conn):
    season = insert_season(db_conn)
    c = insert_contestant(db_conn, season["id"], "Alice")
    url = "https://example.com/alice.jpg"
    r = client.patch(f"/contestants/{c['id']}", json={"image_url": url})
    assert r.status_code == 200
    assert r.json()["image_url"] == url
    # Clearable back to null
    r2 = client.patch(f"/contestants/{c['id']}", json={"image_url": None})
    assert r2.json()["image_url"] is None


# --- episodes ---


@pytest.mark.integration
def test_create_episode(client, db_conn):
    season = insert_season(db_conn)
    r = client.post(
        f"/seasons/{season['id']}/episodes",
        json={
            "episode_number": 1,
            "air_date": "2026-09-01",
            "max_elimination_picks": 3,
            "picks_lock_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert r.status_code == 201
    assert r.json()["episode_number"] == 1
    assert r.json()["status"] == "upcoming"  # not settable here


@pytest.mark.integration
def test_create_episode_duplicate_number(client, db_conn):
    season = insert_season(db_conn)
    insert_episode(db_conn, season["id"], episode_number=1)
    r = client.post(
        f"/seasons/{season['id']}/episodes",
        json={
            "episode_number": 1,
            "air_date": "2026-09-01",
            "max_elimination_picks": 3,
            "picks_lock_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert r.status_code == 409


@pytest.mark.integration
def test_update_episode(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=1)
    r = client.patch(
        f"/episodes/{ep['id']}",
        json={"is_finale": True, "max_elimination_picks": 1},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["is_finale"] is True
    assert data["max_elimination_picks"] == 1


# --- league settings ---


@pytest.mark.integration
def test_get_league_settings(client):
    r = client.get("/league-settings")
    assert r.status_code == 200
    assert r.json()["join_code"] == "change-me"


@pytest.mark.integration
def test_update_league_settings(client):
    r = client.patch("/league-settings", json={"join_code": "new-code-2026"})
    assert r.status_code == 200
    assert r.json()["join_code"] == "new-code-2026"

    r2 = client.get("/league-settings")
    assert r2.json()["join_code"] == "new-code-2026"


# --- scoring event types ---


@pytest.mark.integration
def test_list_scoring_event_types(client):
    r = client.get("/scoring-event-types")
    assert r.status_code == 200
    by_type = {t["event_type"]: t["label"] for t in r.json()}
    assert by_type["win_individual_immunity"] == "Win individual immunity"
    assert "votes_received" in by_type


@pytest.mark.integration
def test_update_contestant_duplicate_placement_rejected(client, db_conn):
    """#112: two contestants can't share a placement — it would double-award
    winner and roster-placement points."""
    season = insert_season(db_conn)
    alice = insert_contestant(db_conn, season["id"], "Alice", placement=1)
    bob = insert_contestant(db_conn, season["id"], "Bob")
    r = client.patch(f"/contestants/{bob['id']}", json={"placement": 1})
    assert r.status_code == 409
    assert "already assigned to Alice" in r.json()["detail"]

    # Re-saving a contestant's own placement stays allowed
    r = client.patch(f"/contestants/{alice['id']}", json={"placement": 1})
    assert r.status_code == 200


@pytest.mark.integration
def test_placement_unique_index_backstop(db_conn):
    """#112: the DB itself rejects a duplicate placement, independent of the
    endpoint's pre-check."""
    season = insert_season(db_conn)
    insert_contestant(db_conn, season["id"], "Alice", placement=1)
    with pytest.raises(pg_errors.UniqueViolation):
        insert_contestant(db_conn, season["id"], "Bob", placement=1)
