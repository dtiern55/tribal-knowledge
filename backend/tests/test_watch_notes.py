import uuid

import pytest

from tests.helpers import insert_episode, insert_season


@pytest.mark.integration
def test_watch_notes_round_trip(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"], episode_number=5)
    base = f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/watch"

    assert client.get(base).json() == {"data": {}}

    payload = {"data": {"boots": ["c1"], "events": {"go_on_journey": {"c1": 1}}}}
    put = client.put(base, json=payload)
    assert put.status_code == 200
    assert put.json() == payload
    assert client.get(base).json() == payload

    client.put(base, json={"data": {"notes": "hi"}})  # upsert replaces
    assert client.get(base).json() == {"data": {"notes": "hi"}}


@pytest.mark.integration
def test_watch_notes_unknown_episode_404(client, db_conn):
    season = insert_season(db_conn)
    base = f"/league-seasons/{season['league_season_id']}/episodes/{uuid.uuid4()}/watch"
    assert client.get(base).status_code == 404


@pytest.mark.integration
def test_watch_notes_requires_auth(unauth_client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(db_conn, season["id"])
    base = f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/watch"
    assert unauth_client.get(base).status_code in (401, 403)
