import uuid

import pytest

from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_elimination_pick,
    insert_episode,
    insert_finale_prediction,
    insert_roster_pick,
    insert_scoring_event,
    insert_season,
    insert_user,
    insert_winner_pick,
)


@pytest.mark.integration
def test_standings_season_not_found(client):
    r = client.get(f"/seasons/{uuid.uuid4()}/standings")
    assert r.status_code == 404


@pytest.mark.integration
def test_standings_lists_members_at_zero(client, db_conn, current_user):
    season = insert_season(db_conn)
    r = client.get(f"/seasons/{season['id']}/standings")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["display_name"] == current_user["display_name"]
    assert data[0]["total_points"] == 0
    assert data[0]["roster_points"] == 0


@pytest.mark.integration
def test_standings_trend_reflects_last_episode(client, db_conn, current_user):
    """A overtakes B in the latest scored episode -> A up, B down."""
    season = insert_season(db_conn, merge_episode=7)
    a = current_user
    b = insert_user(db_conn, display_name="B")
    ca = insert_contestant(db_conn, season["id"], "CA")
    cb = insert_contestant(db_conn, season["id"], "CB")
    ep1 = insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    ep2 = insert_episode(db_conn, season["id"], episode_number=2, status="scored")
    insert_roster_pick(db_conn, a["id"], season["id"], ca["id"])
    insert_roster_pick(db_conn, b["id"], season["id"], cb["id"])
    insert_scoring_event(db_conn, ep1["id"], cb["id"], "acquire_active_idol")  # B +10
    insert_scoring_event(
        db_conn, ep2["id"], ca["id"], "win_individual_immunity"
    )  # A +15

    data = {
        e["display_name"]: e
        for e in client.get(f"/seasons/{season['id']}/standings").json()
    }
    assert data[a["display_name"]]["trend"] == "up"
    assert data["B"]["trend"] == "down"


@pytest.mark.integration
def test_standings_excludes_admin_accounts(client, db_conn, current_user):
    """Producer/service accounts stay out of the leaderboard (#50)."""
    season = insert_season(db_conn)
    insert_user(db_conn, display_name="Producer", is_admin=True)
    r = client.get(f"/seasons/{season['id']}/standings")
    assert r.status_code == 200
    names = [row["display_name"] for row in r.json()]
    assert names == [current_user["display_name"]]


@pytest.mark.integration
def test_scoring_breakdown_hidden_until_roster_lock(client, db_conn, current_user):
    """Another player's breakdown follows the roster visibility rule (#160):
    403 before rosters lock, then roster points only — never their picks."""
    season = insert_season(db_conn, roster_lock_episode=1)
    other = insert_user(db_conn, display_name="Other")

    insert_episode(db_conn, season["id"], episode_number=1)  # lock in the future
    r = client.get(f"/seasons/{season['id']}/scoring-breakdown/{other['id']}")
    assert r.status_code == 403

    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = now() - interval '1 hour'"
            " where season_id = %s",
            [str(season["id"])],
        )
    r = client.get(f"/seasons/{season['id']}/scoring-breakdown/{other['id']}")
    assert r.status_code == 200
    assert r.json()["picks"] == []


@pytest.mark.integration
def test_scoring_breakdown_shape(client, db_conn, current_user):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=3)
    c = insert_contestant(db_conn, season["id"], "Rostered")
    insert_roster_pick(db_conn, current_user["id"], season["id"], c["id"])
    insert_scoring_event(db_conn, ep["id"], c["id"], "win_individual_immunity")
    insert_elimination_pick(db_conn, current_user["id"], ep["id"], c["id"])
    insert_elimination(db_conn, ep["id"], c["id"])

    r = client.get(f"/seasons/{season['id']}/scoring-breakdown/{current_user['id']}")
    assert r.status_code == 200
    data = r.json()
    assert data["roster"] == [{"contestant_id": str(c["id"]), "points": 15}]
    assert data["picks"] == [
        {
            "episode_id": str(ep["id"]),
            "contestant_id": str(c["id"]),
            "correct": True,
            "points": 15,
        }
    ]


@pytest.mark.integration
def test_standings_aggregates_components(client, db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=3)
    insert_episode(db_conn, season["id"], episode_number=13, is_finale=True)
    user = insert_user(db_conn, display_name="Player")

    # roster: +15
    rostered = insert_contestant(db_conn, season["id"], "Rostered")
    insert_roster_pick(db_conn, user["id"], season["id"], rostered["id"])
    insert_scoring_event(db_conn, ep["id"], rostered["id"], "win_individual_immunity")

    # elimination: correct pre-merge pick +15
    boot = insert_contestant(db_conn, season["id"], "Boot", placement=5)
    insert_elimination_pick(db_conn, user["id"], ep["id"], boot["id"])
    insert_elimination(db_conn, ep["id"], boot["id"])

    # winner pick: contestant wins +100
    winner = insert_contestant(db_conn, season["id"], "Winner", placement=1)
    insert_winner_pick(db_conn, user["id"], season["id"], winner["id"])

    # finale ballot: winner vote correct +30
    insert_finale_prediction(db_conn, user["id"], season["id"], winner=winner["id"])

    r = client.get(f"/seasons/{season['id']}/standings")
    assert r.status_code == 200
    entry = r.json()[0]
    assert entry["roster_points"] == 15
    assert entry["elimination_points"] == 15
    assert entry["winner_points"] == 100
    assert entry["finale_points"] == 30
    assert entry["total_points"] == 160


@pytest.mark.integration
def test_standings_sorted_by_total_desc(client, db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2)
    high = insert_user(db_conn, display_name="High")
    insert_user(db_conn, display_name="Low")
    c = insert_contestant(db_conn, season["id"])
    insert_roster_pick(db_conn, high["id"], season["id"], c["id"])
    insert_scoring_event(db_conn, ep["id"], c["id"], "win_individual_immunity")

    r = client.get(f"/seasons/{season['id']}/standings")
    data = r.json()
    # High is first; the remaining users (Low + current_user) are both at 0
    assert data[0]["display_name"] == "High"
    assert data[0]["total_points"] == 15
    zero_names = {d["display_name"] for d in data[1:]}
    assert "Low" in zero_names
    assert all(d["total_points"] == 0 for d in data[1:])
