"""Integration tests for the TVmaze episode-proposal endpoint (#197)."""

import pytest

from app.routers import tvmaze
from tests.helpers import insert_episode, insert_season


def _tvmaze(monkeypatch, episodes):
    seasons = [{"id": 555, "number": 50}]

    def fetch(path, refresh):
        return seasons if path.endswith("/seasons") else episodes

    monkeypatch.setattr(tvmaze, "_fetch", fetch)


_EPS = [
    {
        "number": 1,
        "name": "Premiere",
        "airdate": "2026-02-25",
        "airstamp": "2026-02-26T01:00:00+00:00",
    },
    {
        "number": 2,
        "name": "Week Two",
        "airdate": "2026-03-04",
        "airstamp": "2026-03-05T01:00:00+00:00",
    },
    # Not yet scheduled — must be dropped, and ep 2 becomes the finale flag
    {"number": 3, "name": "TBA", "airdate": "", "airstamp": None},
]


@pytest.mark.integration
def test_proposal_maps_episodes_and_marks_existing(client, db_conn, monkeypatch):
    season = insert_season(db_conn, season_number=50)
    insert_episode(db_conn, season["id"], episode_number=1)
    _tvmaze(monkeypatch, _EPS)

    r = client.get(f"/seasons/{season['id']}/episode-proposal")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "TVmaze — Survivor US season 50"
    assert [e["episode_number"] for e in body["episodes"]] == [1, 2]
    ep1, ep2 = body["episodes"]
    assert ep1["exists"] and not ep2["exists"]
    assert not ep1["is_finale"] and ep2["is_finale"]
    assert ep2["air_date"] == "2026-03-04"
    assert ep2["picks_lock_at"] == "2026-03-05T01:00:00Z"


@pytest.mark.integration
def test_proposal_unknown_tvmaze_season_404s(client, db_conn, monkeypatch):
    season = insert_season(db_conn, season_number=50)
    _tvmaze(monkeypatch, _EPS)
    r = client.get(f"/seasons/{season['id']}/episode-proposal?tvmaze_season=99")
    assert r.status_code == 404
    assert "99" in r.json()["detail"]
