import pytest
from fastapi import HTTPException

from app.auth import get_current_admin
from app.main import app
from tests.helpers import (
    insert_advantage_play,
    insert_contestant,
    insert_elimination,
    insert_elimination_pick,
    insert_episode,
    insert_roster_pick,
    insert_scoring_event,
    insert_season,
    insert_user,
)


@pytest.mark.integration
def test_curated_insights_compute_multiple_elimination_aggregates(
    client, db_conn, current_user
):
    season = insert_season(
        db_conn, status="active", roster_lock_episode=1, merge_episode=7
    )
    episode = insert_episode(db_conn, season["id"], status="scored")
    other = insert_user(db_conn, display_name="Other")
    ours = insert_contestant(db_conn, season["id"], "Ours")
    theirs = insert_contestant(db_conn, season["id"], "Theirs")
    first = insert_contestant(db_conn, season["id"], "First Boot")
    second = insert_contestant(db_conn, season["id"], "Second Boot")
    insert_roster_pick(db_conn, current_user["id"], season["id"], ours["id"])
    insert_roster_pick(db_conn, other["id"], season["id"], theirs["id"])
    insert_scoring_event(db_conn, episode["id"], ours["id"], "win_individual_immunity")
    for contestant in [first, second]:
        insert_elimination(db_conn, episode["id"], contestant["id"])
        insert_elimination_pick(
            db_conn, current_user["id"], episode["id"], contestant["id"]
        )
    insert_elimination_pick(db_conn, other["id"], episode["id"], first["id"])

    configured = client.put(
        f"/episodes/{episode['id']}/insights",
        json=[
            {
                "insight_type": "pick_popularity",
                "contestant_id": str(first["id"]),
            },
            {"insight_type": "multiple_correct_ballots"},
            {"insight_type": "performance_vs_median"},
        ],
    )
    assert configured.status_code == 200

    result = client.get(
        f"/seasons/{season['id']}/episode-results/{episode['id']}"
    ).json()
    insights = result["insights"]
    assert [item["label"] for item in insights] == [
        "League call: First Boot",
        "Multiple correct picks",
        "Versus league median",
    ]
    assert insights[0]["value"] == "100%"
    assert insights[0]["detail"] == "2 of 2 submitted ballots included this castaway."
    assert insights[1]["value"] == "1 of 2"
    # Current user: 47; other: 16; median: 31.5.
    assert insights[2]["value"] == "+15.5 pts"
    assert insights[2]["detail"] == "You scored 47; the league median was 31.5."


@pytest.mark.integration
def test_weekly_play_usage_and_empty_configuration(client, db_conn, current_user):
    season = insert_season(db_conn, status="active", roster_lock_episode=1)
    episode = insert_episode(db_conn, season["id"], status="scored")
    other = insert_user(db_conn, display_name="Other")
    for user, name in [(current_user, "Ours"), (other, "Theirs")]:
        contestant = insert_contestant(db_conn, season["id"], name)
        insert_roster_pick(db_conn, user["id"], season["id"], contestant["id"])
    insert_advantage_play(
        db_conn, current_user["id"], episode["id"], "double_vote_points"
    )

    url = f"/episodes/{episode['id']}/insights"
    assert (
        client.get(f"/seasons/{season['id']}/episode-results/{episode['id']}").json()[
            "insights"
        ]
        == []
    )
    saved = client.put(
        url,
        json=[
            {
                "insight_type": "weekly_play_usage",
                "advantage_type": "double_vote_points",
            }
        ],
    )
    assert saved.status_code == 200
    insight = client.get(
        f"/seasons/{season['id']}/episode-results/{episode['id']}"
    ).json()["insights"][0]
    assert insight["value"] == "1 of 2"
    assert insight["label"] == "Double Vote Points usage"

    assert client.put(url, json=[]).status_code == 200
    assert (
        client.get(f"/seasons/{season['id']}/episode-results/{episode['id']}").json()[
            "insights"
        ]
        == []
    )


@pytest.mark.integration
def test_insight_configuration_rejects_misleading_selections(client, db_conn):
    season = insert_season(db_conn, roster_lock_episode=1)
    episode = insert_episode(db_conn, season["id"], status="scored")
    safe = insert_contestant(db_conn, season["id"], "Safe")
    url = f"/episodes/{episode['id']}/insights"

    response = client.put(
        url,
        json=[
            {
                "insight_type": "pick_popularity",
                "contestant_id": str(safe["id"]),
            }
        ],
    )
    assert response.status_code == 400
    assert "must be eliminated" in response.json()["detail"]

    response = client.put(
        url,
        json=[{"insight_type": "performance_vs_median"}] * 4,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Choose at most three insights"


@pytest.mark.integration
def test_insight_aggregates_are_unavailable_before_score(client, db_conn):
    season = insert_season(db_conn, roster_lock_episode=1)
    episode = insert_episode(db_conn, season["id"], status="upcoming")
    response = client.get(f"/seasons/{season['id']}/episode-results/{episode['id']}")
    assert response.status_code == 409


@pytest.mark.integration
def test_insight_configuration_requires_admin(client, db_conn):
    season = insert_season(db_conn)
    episode = insert_episode(db_conn, season["id"])

    def reject_non_admin():
        raise HTTPException(status_code=403, detail="Admin access required")

    app.dependency_overrides[get_current_admin] = reject_non_admin
    response = client.put(f"/episodes/{episode['id']}/insights", json=[])
    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required"
