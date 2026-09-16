"""The dry-run jump (app/routers/dry_run.py): a seeded season rewinds to any
week, and the future stays hidden behind the lock rule."""

from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    default_league,
    enroll,
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_season,
    insert_user,
)

PAST = datetime.now(timezone.utc) - timedelta(days=1)


def _seeded_season(conn, episodes=4):
    """A finished season: every episode scored, one boot per episode."""
    season = insert_season(conn, roster_lock_episode=2, status="completed")
    cast = [insert_contestant(conn, season["id"], name=f"C{i}") for i in range(6)]
    for n in range(1, episodes + 1):
        ep = insert_episode(
            conn,
            season["id"],
            episode_number=n,
            picks_lock_at=PAST,
            is_finale=n == episodes,
        )
        insert_elimination(conn, ep["id"], cast[n - 1]["id"])
        with conn.cursor() as cur:
            cur.execute("update episodes set status='scored' where id=%s", [ep["id"]])
    return season, cast


@pytest.mark.integration
def test_jump_reopens_from_the_target_and_hides_later_boots(client, db_conn):
    season, cast = _seeded_season(db_conn)
    r = client.post(f"/seasons/{season['id']}/jump", json={"episode": 3})
    assert r.status_code == 200, r.text
    by_n = {e["episode_number"]: e for e in r.json()}
    assert [by_n[n]["status"] for n in (1, 2, 3, 4)] == [
        "scored",
        "scored",
        "upcoming",
        "upcoming",
    ]
    assert by_n[3]["picks_lock_at"].startswith("2099")
    with db_conn.cursor() as cur:
        cur.execute("select status from seasons where id=%s", [season["id"]])
        assert cur.fetchone()["status"] == "active"

    # The cast list only knows the boots that have locked.
    rows = client.get(f"/seasons/{season['id']}/contestants").json()
    out = {c["name"]: c["eliminated_in_episode"] for c in rows}
    assert out["C0"] == 1 and out["C1"] == 2
    assert out["C2"] is None and out["C3"] is None

    # And "complete" puts it all back.
    r = client.post(f"/seasons/{season['id']}/jump", json={"complete": True})
    assert all(e["status"] == "scored" for e in r.json())


@pytest.mark.integration
def test_jump_drafts_the_jumper_a_roster_past_the_lock(client, db_conn, current_user):
    season, _ = _seeded_season(db_conn)
    enroll(db_conn, default_league(db_conn)["id"], current_user["id"])
    client.post(f"/seasons/{season['id']}/jump", json={"episode": 3})
    with db_conn.cursor() as cur:
        cur.execute(
            "select count(*) n, min(active_from_episode) f from roster_picks"
            " where user_id=%s and league_season_id=%s",
            [str(current_user["id"]), season["league_season_id"]],
        )
        row = cur.fetchone()
    assert (row["n"], row["f"]) == (5, 2)


@pytest.mark.integration
def test_jump_refuses_a_season_with_real_players(client, db_conn):
    season, _ = _seeded_season(db_conn)
    player = insert_user(db_conn, display_name="Real Player")
    enroll(db_conn, default_league(db_conn)["id"], player["id"])
    r = client.post(f"/seasons/{season['id']}/jump", json={"episode": 2})
    assert r.status_code == 403
