"""Integration tests for the admin import-proposal endpoint (#132)."""

import pytest

from app.routers import survivor_import
from tests.helpers import insert_contestant, insert_episode, insert_season

S = "US47"


def _data(**overrides):
    base = {
        "vote_history": [],
        "boot_order": [],
        "challenge_results": [],
        "journeys": [],
        "advantage_movement": [],
        "advantage_details": [],
        "castaways": [
            {
                "version_season": S,
                "castaway_id": "A",
                "castaway": "Ann",
                "full_name": "Ann Smith",
            },
            {
                "version_season": S,
                "castaway_id": "B",
                "castaway": "Bob",
                "full_name": "Robert Jones",
            },
        ],
    }
    base.update(overrides)
    return base


@pytest.mark.integration
def test_proposal_maps_names_and_reports_unmatched(
    client, db_conn, current_user, monkeypatch
):
    season = insert_season(db_conn, season_number=47)
    ep = insert_episode(db_conn, season["id"], episode_number=5)
    ann = insert_contestant(db_conn, season["id"], "Ann")  # short-name match
    # Bob has no league contestant — his items must drop into `unmatched`

    monkeypatch.setattr(
        survivor_import,
        "_fetch_survivor_data",
        lambda refresh: _data(
            boot_order=[
                {
                    "version_season": S,
                    "episode": 5,
                    "castaway_id": "A",
                    "castaway": "Ann",
                    "result": "5th voted out",
                }
            ],
            tribe_mapping=[
                {
                    "version_season": S,
                    "castaway_id": "A",
                    "castaway": "Ann",
                    "episode": 6,
                    "tribe": None,
                    "tribe_status": "Redemption Island",
                }
            ],
            challenge_results=[
                {
                    "version_season": S,
                    "episode": 5,
                    "castaway_id": "A",
                    "castaway": "Ann",
                    "won_individual_immunity": True,
                },
                {
                    "version_season": S,
                    "episode": 5,
                    "castaway_id": "B",
                    "castaway": "Bob",
                    "won_individual_reward": True,
                },
            ],
        ),
    )

    r = client.get(f"/episodes/{ep['id']}/import-proposal")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == f"{S} episode 5"
    # A Redemption Island boot keeps is_final=False through the mapping (#712).
    assert body["eliminations"] == [
        {
            "contestant_id": str(ann["id"]),
            "name": "Ann",
            "elimination_type": "voted_out",
            "result": "5th voted out → Redemption Island",
            "is_final": False,
        }
    ]
    assert body["events"] == [
        {
            "contestant_id": str(ann["id"]),
            "name": "Ann",
            "event_type": "win_individual_immunity",
            "quantity": 1,
        }
    ]
    assert body["unmatched"] == ["Bob / Robert Jones"]


@pytest.mark.integration
def test_proposal_unknown_source_season_404s(client, db_conn, monkeypatch):
    season = insert_season(db_conn, season_number=47)
    ep = insert_episode(db_conn, season["id"], episode_number=1)
    monkeypatch.setattr(
        survivor_import, "_fetch_survivor_data", lambda refresh: _data()
    )
    r = client.get(f"/episodes/{ep['id']}/import-proposal?source_season=99")
    assert r.status_code == 404
    assert "US99" in r.json()["detail"]
