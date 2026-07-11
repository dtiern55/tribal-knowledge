import uuid

import pytest

from tests.helpers import insert_contestant as _insert_contestant
from tests.helpers import insert_season as _insert_season


@pytest.mark.integration
def test_list_seasons_empty(client):
    # Seed data adds one season; just verify the endpoint responds correctly.
    r = client.get("/seasons")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.integration
def test_list_seasons(client, db_conn):
    before = len(client.get("/seasons").json())
    _insert_season(db_conn, name="Survivor: Heroes vs Villains", season_number=20)
    r = client.get("/seasons")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == before + 1
    names = [s["name"] for s in data]
    assert "Survivor: Heroes vs Villains" in names


@pytest.mark.integration
def test_list_seasons_ordered(client, db_conn):
    _insert_season(db_conn, name="Season B", season_number=2)
    _insert_season(db_conn, name="Season A", season_number=1)
    r = client.get("/seasons")
    assert r.status_code == 200
    numbers = [s["season_number"] for s in r.json()]
    # Seasons 1 and 2 must appear in ascending order (seed season 99 is after them)
    assert numbers.index(1) < numbers.index(2)


@pytest.mark.integration
def test_list_contestants(client, db_conn):
    season = _insert_season(db_conn)
    _insert_contestant(db_conn, season["id"], "Tony Vlachos")
    _insert_contestant(db_conn, season["id"], "Sandra Diaz-Twine")
    r = client.get(f"/seasons/{season['id']}/contestants")
    assert r.status_code == 200
    names = [c["name"] for c in r.json()]
    assert names == ["Sandra Diaz-Twine", "Tony Vlachos"]  # ordered by name


@pytest.mark.integration
def test_list_contestants_empty(client, db_conn):
    season = _insert_season(db_conn)
    r = client.get(f"/seasons/{season['id']}/contestants")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_list_contestants_season_not_found(client):
    r = client.get(f"/seasons/{uuid.uuid4()}/contestants")
    assert r.status_code == 404


@pytest.mark.integration
def test_list_contestants_only_returns_own_season(client, db_conn):
    s1 = _insert_season(db_conn, season_number=1)
    s2 = _insert_season(db_conn, season_number=2)
    _insert_contestant(db_conn, s1["id"], "Player A")
    _insert_contestant(db_conn, s2["id"], "Player B")
    r = client.get(f"/seasons/{s1['id']}/contestants")
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["name"] == "Player A"


@pytest.mark.integration
def test_list_contestants_includes_eliminated_in_episode(client, db_conn):
    from tests.helpers import insert_elimination, insert_episode

    season = _insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=3)
    out = _insert_contestant(db_conn, season["id"], "Booted")
    _insert_contestant(db_conn, season["id"], "Safe")
    insert_elimination(db_conn, ep["id"], out["id"])
    r = client.get(f"/seasons/{season['id']}/contestants")
    assert r.status_code == 200
    by_name = {c["name"]: c for c in r.json()}
    assert by_name["Booted"]["eliminated_in_episode"] == 3
    assert by_name["Safe"]["eliminated_in_episode"] is None
