import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_scoring_event,
    insert_season,
)


def _lock(db_conn, episode_id):
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = %s where id = %s",
            [datetime.now(timezone.utc) - timedelta(hours=1), str(episode_id)],
        )


@pytest.mark.integration
def test_cast_and_performance_hide_results_until_lock(client, db_conn):
    """#559: scoring an episode before its picks_lock_at must not leak the boot
    or points through the cast list or a contestant's performance page."""
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2)  # unlocked
    star = insert_contestant(db_conn, season["id"], "Star")
    boot = insert_contestant(db_conn, season["id"], "Boot")
    insert_scoring_event(db_conn, ep["id"], star["id"], "win_individual_immunity")
    insert_elimination(db_conn, ep["id"], boot["id"])

    # Pre-lock: cast shows no points and no boot; both contestants still listed.
    cast = {c["name"]: c for c in client.get(f"/seasons/{season['id']}/cast").json()}
    assert set(cast) == {"Star", "Boot"}
    assert cast["Star"]["total_points"] == 0
    assert cast["Boot"]["eliminated_in_episode"] is None

    perf = client.get(f"/contestants/{star['id']}/performance").json()
    assert perf["total_points"] == 0 and perf["episodes"] == []
    boot_perf = client.get(f"/contestants/{boot['id']}/performance").json()
    assert boot_perf["eliminated_in_episode"] is None

    _lock(db_conn, ep["id"])

    cast = {c["name"]: c for c in client.get(f"/seasons/{season['id']}/cast").json()}
    assert cast["Star"]["total_points"] == 15
    assert cast["Boot"]["eliminated_in_episode"] == 2
    perf = client.get(f"/contestants/{star['id']}/performance").json()
    assert perf["total_points"] == 15
    assert (
        client.get(f"/contestants/{boot['id']}/performance").json()[
            "eliminated_in_episode"
        ]
        == 2
    )


@pytest.mark.integration
def test_contestant_performance_not_found(client):
    r = client.get(f"/contestants/{uuid.uuid4()}/performance")
    assert r.status_code == 404


@pytest.mark.integration
def test_contestant_performance(client, db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2, status="scored")
    c = insert_contestant(db_conn, season["id"], "Star")
    insert_scoring_event(db_conn, ep["id"], c["id"], "win_individual_immunity")  # +15
    insert_elimination(db_conn, ep["id"], c["id"])

    r = client.get(f"/contestants/{c['id']}/performance")
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Star"
    assert data["total_points"] == 15
    assert data["eliminated_in_episode"] == 2
    ep2 = next(e for e in data["episodes"] if e["episode_number"] == 2)
    assert ep2["points"] == 15
    assert ep2["eliminated_type"] == "voted_out"
    ev = ep2["events"][0]
    assert ev["label"] == "Win individual immunity"
    assert ev["points"] == 15
    assert ev["token_value"] == 0


@pytest.mark.integration
def test_cast_lists_base_scores(client, db_conn):
    """Cast list returns every contestant with base points, sorted desc (#83)."""
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2, status="scored")
    star = insert_contestant(db_conn, season["id"], "Star")
    dud = insert_contestant(db_conn, season["id"], "Dud")
    insert_scoring_event(
        db_conn, ep["id"], star["id"], "win_individual_immunity"
    )  # +15
    insert_scoring_event(db_conn, ep["id"], star["id"], "cry_on_camera")  # +5 tkn
    insert_elimination(db_conn, ep["id"], dud["id"])

    cast = client.get(f"/seasons/{season['id']}/cast").json()
    assert [c["name"] for c in cast] == ["Star", "Dud"]  # sorted by points desc
    star_row = cast[0]
    assert star_row["total_points"] == 15
    assert star_row["total_tokens"] == 5
    assert cast[1]["total_points"] == 0
    assert cast[1]["eliminated_in_episode"] == 2


@pytest.mark.integration
def test_contestant_performance_votes_received_itemized(client, db_conn):
    """Votes received show the count (quantity) but score 0 points (#15)."""
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=3, status="scored")
    c = insert_contestant(db_conn, season["id"], "Target")
    insert_scoring_event(db_conn, ep["id"], c["id"], "votes_received", quantity=3)

    r = client.get(f"/contestants/{c['id']}/performance")
    ev = r.json()["episodes"][0]["events"][0]
    assert ev["quantity"] == 3
    assert ev["points"] == 0
    assert r.json()["total_points"] == 0


@pytest.mark.integration
def test_contestant_performance_token_only_event(client, db_conn):
    """Token-only events report their token value, not just +0 points (#83)."""
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2, status="scored")
    c = insert_contestant(db_conn, season["id"], "Star")
    insert_scoring_event(db_conn, ep["id"], c["id"], "cry_on_camera")  # 0 pts / 5 tkn

    r = client.get(f"/contestants/{c['id']}/performance")
    ev = r.json()["episodes"][0]["events"][0]
    assert ev["points"] == 0
    assert ev["token_value"] == 5


@pytest.mark.integration
def test_contestant_performance_includes_bio(client, db_conn):
    """The bio columns reach the response, not just the query (#262).

    They were first added to the select alone, and the endpoint builds its
    response as an explicit dict — so every field came back null.
    """
    season = insert_season(db_conn)
    c = insert_contestant(db_conn, season["id"], "Natalia")
    with db_conn.cursor() as cur:
        cur.execute(
            "update contestants set age = %s, occupation = %s, hometown = %s,"
            " bio = %s where id = %s",
            [
                26,
                "Industrial Engineer",
                "Irvine, California",
                "Two sentences.",
                c["id"],
            ],
        )

    data = client.get(f"/contestants/{c['id']}/performance").json()
    assert data["age"] == 26
    assert data["occupation"] == "Industrial Engineer"
    assert data["hometown"] == "Irvine, California"
    assert data["bio"] == "Two sentences."
