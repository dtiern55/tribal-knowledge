"""Season-configurable elimination-pick schedule (#269)."""

from datetime import datetime, timezone

import pytest

from app.routers.episodes import resolve_max_elimination_picks
from tests.helpers import insert_season

CAGAYAN = [
    {"from_episode": 2, "picks": 3},
    {"from_episode": 6, "picks": 2},
    {"from_episode": 11, "picks": 1},
]


@pytest.mark.parametrize(
    "episode_number,expected",
    [
        (1, 3),  # below the first tier: the old default
        (2, 3),
        (5, 3),
        (6, 2),  # tier boundary
        (10, 2),
        (11, 1),  # tier boundary
        (13, 1),  # past the last tier: it keeps applying
    ],
)
def test_resolve_from_schedule(episode_number, expected):
    assert resolve_max_elimination_picks(CAGAYAN, episode_number) == expected


def test_resolve_no_schedule():
    assert resolve_max_elimination_picks([], 7) == 3


def test_resolve_ignores_tier_order():
    assert resolve_max_elimination_picks(list(reversed(CAGAYAN)), 7) == 2


@pytest.mark.integration
def test_create_episode_uses_season_schedule(client, db_conn):
    season = insert_season(db_conn)
    r = client.patch(
        f"/seasons/{season['id']}", json={"elimination_pick_schedule": CAGAYAN}
    )
    assert r.status_code == 200
    assert r.json()["elimination_pick_schedule"] == CAGAYAN

    for episode_number, expected in [(5, 3), (6, 2), (11, 1)]:
        r = client.post(
            f"/seasons/{season['id']}/episodes",
            json={
                "episode_number": episode_number,
                "air_date": "2026-09-01",
                "picks_lock_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        assert r.status_code == 201
        assert r.json()["max_elimination_picks"] == expected


@pytest.mark.integration
def test_create_episode_explicit_value_wins(client, db_conn):
    season = insert_season(db_conn)
    client.patch(
        f"/seasons/{season['id']}", json={"elimination_pick_schedule": CAGAYAN}
    )
    r = client.post(
        f"/seasons/{season['id']}/episodes",
        json={
            "episode_number": 12,
            "air_date": "2026-09-01",
            "max_elimination_picks": 3,
            "picks_lock_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert r.status_code == 201
    assert r.json()["max_elimination_picks"] == 3


@pytest.mark.integration
def test_create_episode_without_schedule_defaults_to_three(client, db_conn):
    season = insert_season(db_conn)
    r = client.post(
        f"/seasons/{season['id']}/episodes",
        json={
            "episode_number": 4,
            "air_date": "2026-09-01",
            "picks_lock_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert r.status_code == 201
    assert r.json()["max_elimination_picks"] == 3
