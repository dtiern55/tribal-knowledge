import uuid

import pytest


def _insert_season(conn, name="Survivor: Test Island", season_number=99, **kwargs):
    params = {
        "name": name,
        "season_number": season_number,
        "roster_size": 5,
        "status": "upcoming",
        **kwargs,
    }
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into seasons (name, season_number, roster_size, status)
            values (%(name)s, %(season_number)s, %(roster_size)s, %(status)s)
            returning *
            """,
            params,
        )
        return cur.fetchone()


def _insert_contestant(conn, season_id, name):
    with conn.cursor() as cur:
        cur.execute(
            "insert into contestants (season_id, name) values (%s, %s) returning *",
            [str(season_id), name],
        )
        return cur.fetchone()


@pytest.mark.integration
def test_list_seasons_empty(client):
    r = client.get("/seasons")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_list_seasons(client, db_conn):
    _insert_season(db_conn, name="Survivor: Heroes vs Villains", season_number=20)
    r = client.get("/seasons")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["name"] == "Survivor: Heroes vs Villains"
    assert data[0]["season_number"] == 20


@pytest.mark.integration
def test_list_seasons_ordered(client, db_conn):
    _insert_season(db_conn, name="Season B", season_number=2)
    _insert_season(db_conn, name="Season A", season_number=1)
    r = client.get("/seasons")
    assert r.status_code == 200
    numbers = [s["season_number"] for s in r.json()]
    assert numbers == [1, 2]


@pytest.mark.integration
def test_get_season(client, db_conn):
    season = _insert_season(db_conn)
    r = client.get(f"/seasons/{season['id']}")
    assert r.status_code == 200
    assert r.json()["season_number"] == 99


@pytest.mark.integration
def test_get_season_not_found(client):
    r = client.get(f"/seasons/{uuid.uuid4()}")
    assert r.status_code == 404


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
