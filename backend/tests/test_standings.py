import uuid
from datetime import datetime, timedelta, timezone

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
)


@pytest.mark.integration
def test_standings_season_not_found(client):
    r = client.get(f"/seasons/{uuid.uuid4()}/standings")
    assert r.status_code == 404


@pytest.mark.integration
def test_standings_lists_members_at_zero(client, db_conn, current_user):
    season = insert_season(db_conn)
    r = client.get(f"/league-seasons/{season['league_season_id']}/standings")
    assert r.status_code == 200
    data = r.json()
    assert len(data) == 1
    assert data[0]["display_name"] == current_user["display_name"]
    assert data[0]["total_points"] == 0
    assert data[0]["roster_points"] == 0


@pytest.mark.integration
def test_standings_survivors_include_tribe_treatment_data(
    client, db_conn, current_user
):
    season = insert_season(db_conn, roster_lock_episode=1)
    insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    contestant = insert_contestant(db_conn, season["id"], "Kenzie")
    with db_conn.cursor() as cur:
        cur.execute(
            "insert into tribes (season_id, name, color)"
            " values (%s, %s, %s) returning id",
            [str(season["id"]), "Yanu", "#7651a1"],
        )
        tribe_id = cur.fetchone()["id"]
        cur.execute(
            "insert into contestant_tribes (contestant_id, tribe_id, from_episode)"
            " values (%s, %s, 1)",
            [str(contestant["id"]), str(tribe_id)],
        )
    insert_roster_pick(db_conn, current_user["id"], season["id"], contestant["id"])

    entry = client.get(
        f"/league-seasons/{season['league_season_id']}/standings"
    ).json()[0]
    assert entry["active_survivors"] == [
        {
            "contestant_id": str(contestant["id"]),
            "name": "Kenzie",
            "image_url": None,
            "tribe_name": "Yanu",
            "tribe_color": "#7651a1",
            "eliminated_episode": None,
        }
    ]


@pytest.mark.integration
def test_active_survivors_keep_a_boot_until_its_episode_locks(
    client, db_conn, current_user
):
    """#559: an elimination applied before the episode's picks_lock_at must not
    drop the contestant from the active roster (revealing the boot early)."""
    season = insert_season(db_conn, roster_lock_episode=1)
    insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)  # unlocked
    booted = insert_contestant(db_conn, season["id"], "Booted")
    insert_roster_pick(db_conn, current_user["id"], season["id"], booted["id"])
    insert_elimination(db_conn, ep2["id"], booted["id"])  # applied early

    def survivor_names():
        entry = client.get(
            f"/league-seasons/{season['league_season_id']}/standings"
        ).json()[0]
        return {s["name"] for s in entry["active_survivors"]}

    assert "Booted" in survivor_names()  # boot hidden pre-lock

    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = %s where id = %s",
            [datetime.now(timezone.utc) - timedelta(hours=1), str(ep2["id"])],
        )
    assert "Booted" not in survivor_names()  # drops once the episode locks


@pytest.mark.integration
def test_completed_season_lists_only_participants(client, db_conn, current_user):
    """A past season shows only members who actually played it (#235)."""
    season = insert_season(db_conn, status="completed")
    played = insert_user(db_conn, display_name="Played")
    insert_user(db_conn, display_name="Never Played")  # signed up, no roster here
    c = insert_contestant(db_conn, season["id"])
    insert_roster_pick(db_conn, played["id"], season["id"], c["id"])

    data = client.get(f"/league-seasons/{season['league_season_id']}/standings").json()
    names = {e["display_name"] for e in data}
    assert names == {"Played"}


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
        for e in client.get(
            f"/league-seasons/{season['league_season_id']}/standings"
        ).json()
    }
    assert data[a["display_name"]]["trend"] == "up"
    assert data["B"]["trend"] == "down"


@pytest.mark.integration
def test_standings_excludes_service_accounts(client, db_conn, current_user):
    """Service accounts (is_player=false) stay out of the leaderboard (#50),
    but a commissioner who also plays (admin + is_player) is included (#471)."""
    season = insert_season(db_conn)
    insert_user(db_conn, display_name="Producer", is_admin=True, is_player=False)
    commish = insert_user(db_conn, display_name="Commish", is_admin=True)
    r = client.get(f"/league-seasons/{season['league_season_id']}/standings")
    assert r.status_code == 200
    names = [row["display_name"] for row in r.json()]
    assert "Producer" not in names
    assert set(names) == {current_user["display_name"], commish["display_name"]}


@pytest.mark.integration
def test_scoring_breakdown_hidden_until_roster_lock(client, db_conn, current_user):
    """Another player's breakdown follows the roster visibility rule (#160):
    403 before rosters lock, then roster points only — never their picks."""
    season = insert_season(db_conn, roster_lock_episode=1)
    other = insert_user(db_conn, display_name="Other")

    insert_episode(db_conn, season["id"], episode_number=1)  # lock in the future
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/scoring-breakdown/{other['id']}"
    )
    assert r.status_code == 403

    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = now() - interval '1 hour'"
            " where season_id = %s",
            [str(season["id"])],
        )
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/scoring-breakdown/{other['id']}"
    )
    assert r.status_code == 200
    assert r.json()["picks"] == []


@pytest.mark.integration
def test_scoring_breakdown_shape(client, db_conn, current_user):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=3, status="scored")
    c = insert_contestant(db_conn, season["id"], "Rostered")
    insert_roster_pick(db_conn, current_user["id"], season["id"], c["id"])
    insert_scoring_event(db_conn, ep["id"], c["id"], "win_individual_immunity")
    insert_elimination_pick(db_conn, current_user["id"], ep["id"], c["id"])
    insert_elimination(db_conn, ep["id"], c["id"])

    r = client.get(
        f"/league-seasons/{season['league_season_id']}/scoring-breakdown/{current_user['id']}"
    )
    assert r.status_code == 200
    data = r.json()
    assert data["roster"] == [{"contestant_id": str(c["id"]), "points": 15}]
    assert data["picks"] == [
        {
            "episode_id": str(ep["id"]),
            "contestant_id": str(c["id"]),
            "correct": True,
            "points": 16,
        }
    ]


@pytest.mark.integration
def test_standings_aggregates_components(client, db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=3, status="scored")
    insert_episode(db_conn, season["id"], episode_number=13, is_finale=True)
    user = insert_user(db_conn, display_name="Player")

    # roster: +15
    rostered = insert_contestant(db_conn, season["id"], "Rostered")
    insert_roster_pick(db_conn, user["id"], season["id"], rostered["id"])
    insert_scoring_event(db_conn, ep["id"], rostered["id"], "win_individual_immunity")

    # elimination: correct pre-merge pick +16
    boot = insert_contestant(db_conn, season["id"], "Boot", placement=5)
    insert_elimination_pick(db_conn, user["id"], ep["id"], boot["id"])
    insert_elimination(db_conn, ep["id"], boot["id"])

    # finale ballot: winner vote correct +40 (winner isn't rostered, so no
    # roster-placement points).
    winner = insert_contestant(db_conn, season["id"], "Winner", placement=1)
    insert_finale_prediction(db_conn, user["id"], season["id"], winner=winner["id"])

    r = client.get(f"/league-seasons/{season['league_season_id']}/standings")
    assert r.status_code == 200
    entry = r.json()[0]
    assert entry["roster_points"] == 15
    assert entry["elimination_points"] == 16
    assert entry["finale_points"] == 40
    assert entry["total_points"] == 71


@pytest.mark.integration
def test_standings_sorted_by_total_desc(client, db_conn):
    season = insert_season(db_conn, merge_episode=7)
    ep = insert_episode(db_conn, season["id"], episode_number=2, status="scored")
    high = insert_user(db_conn, display_name="High")
    insert_user(db_conn, display_name="Low")
    c = insert_contestant(db_conn, season["id"])
    insert_roster_pick(db_conn, high["id"], season["id"], c["id"])
    insert_scoring_event(db_conn, ep["id"], c["id"], "win_individual_immunity")

    r = client.get(f"/league-seasons/{season['league_season_id']}/standings")
    data = r.json()
    # High is first; the remaining users (Low + current_user) are both at 0
    assert data[0]["display_name"] == "High"
    assert data[0]["total_points"] == 15
    zero_names = {d["display_name"] for d in data[1:]}
    assert "Low" in zero_names
    assert all(d["total_points"] == 0 for d in data[1:])
