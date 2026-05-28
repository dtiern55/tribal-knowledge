import uuid

import pytest

from tests.helpers import insert_episode, insert_season


@pytest.mark.integration
def test_list_episodes_empty(client, db_conn):
    season = insert_season(db_conn)
    r = client.get(f"/seasons/{season['id']}/episodes")
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_list_episodes(client, db_conn):
    season = insert_season(db_conn)
    insert_episode(db_conn, season["id"], episode_number=1)
    insert_episode(db_conn, season["id"], episode_number=2)
    r = client.get(f"/seasons/{season['id']}/episodes")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 2
    assert [e["episode_number"] for e in data] == [1, 2]


@pytest.mark.integration
def test_list_episodes_season_not_found(client):
    r = client.get(f"/seasons/{uuid.uuid4()}/episodes")
    assert r.status_code == 404


@pytest.mark.integration
def test_get_episode(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=3, is_finale=True)
    r = client.get(f"/episodes/{ep['id']}")
    assert r.status_code == 200
    data = r.json()
    assert data["episode_number"] == 3
    assert data["is_finale"] is True
    assert data["season_id"] == str(season["id"])


@pytest.mark.integration
def test_get_episode_not_found(client):
    r = client.get(f"/episodes/{uuid.uuid4()}")
    assert r.status_code == 404


@pytest.mark.integration
def test_list_episodes_only_own_season(client, db_conn):
    s1 = insert_season(db_conn, season_number=1)
    s2 = insert_season(db_conn, season_number=2)
    insert_episode(db_conn, s1["id"], episode_number=1)
    insert_episode(db_conn, s2["id"], episode_number=1)
    r = client.get(f"/seasons/{s1['id']}/episodes")
    assert r.status_code == 200
    assert len(r.json()) == 1
