import pytest

from tests.helpers import (
    enroll,
    insert_advantage_play,
    insert_contestant,
    insert_elimination,
    insert_elimination_pick,
    insert_episode,
    insert_league,
    insert_roster_pick,
    insert_season,
    insert_user,
    league_season_id,
)


def _ls(client, league_id, season_id, **knobs):
    r = client.post(
        f"/leagues/{league_id}/seasons", json={"season_id": str(season_id), **knobs}
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.integration
def test_add_season_to_league_defaults_and_guards(client, db_conn):
    season = insert_season(db_conn)
    league = insert_league(db_conn, name="Camp B")
    ls = _ls(client, league["id"], season["id"])
    assert ls["roster_size"] == 5  # default
    assert ls["roster_lock_episode"] == 2  # default: premiere watch-only (#152)
    assert ls["season_id"] == str(season["id"])
    assert ls["league_name"] == "Camp B"
    assert ls["name"] == season["name"]

    r = client.post(
        f"/leagues/{league['id']}/seasons",
        json={"season_id": str(season["id"]), "roster_size": 99},
    )
    assert r.status_code == 422  # pydantic le=10
    r = client.post(
        f"/leagues/{league['id']}/seasons", json={"season_id": str(season["id"])}
    )
    assert r.status_code == 409  # already plays it

    r = client.patch(f"/league-seasons/{ls['id']}", json={"roster_lock_episode": 3})
    assert r.status_code == 200
    assert r.json()["roster_lock_episode"] == 3


@pytest.mark.integration
def test_league_seasons_listed_by_membership(client, db_conn, current_user):
    """A player sees the league-seasons of their leagues; an admin sees all."""
    season = insert_season(db_conn)  # default league: current_user is a member
    other = insert_league(db_conn, name="Elsewhere")
    theirs = _ls(client, other["id"], season["id"])

    ids = {ls["id"] for ls in client.get("/league-seasons").json()}
    assert season["league_season_id"] in ids
    assert theirs["id"] not in ids
    assert client.get(f"/league-seasons/{theirs['id']}").status_code == 403
    assert client.get(f"/league-seasons/{theirs['id']}/standings").status_code == 403

    with db_conn.cursor() as cur:
        cur.execute(
            "update profiles set is_admin = true where id = %s",
            [str(current_user["id"])],
        )
    ids = {ls["id"] for ls in client.get("/league-seasons").json()}
    assert theirs["id"] in ids


@pytest.mark.integration
def test_two_leagues_play_one_season_separately(client, db_conn, current_user):
    """Rosters and standings are per league-season (#595): the same season,
    two leagues, nothing shared but the show."""
    season = insert_season(db_conn, roster_lock_episode=1)
    c = insert_contestant(db_conn, season["id"], "Kenzie")
    other_league = insert_league(db_conn, name="Camp B")
    enroll(db_conn, other_league["id"], current_user["id"])
    other_ls = _ls(
        client, other_league["id"], season["id"], roster_lock_episode=1, roster_size=1
    )
    rival = insert_user(db_conn, display_name="Rival")  # default league only

    # Roster in the default league; nothing in Camp B yet.
    insert_roster_pick(db_conn, current_user["id"], season["id"], c["id"])
    mine = client.get(
        f"/league-seasons/{season['league_season_id']}/roster/{current_user['id']}"
    ).json()
    assert [r["contestant_id"] for r in mine] == [str(c["id"])]
    assert (
        client.get(
            f"/league-seasons/{other_ls['id']}/roster/{current_user['id']}"
        ).json()
        == []
    )

    # Camp B's roster is its own row, and the same castaway is allowed.
    r = client.post(
        f"/league-seasons/{other_ls['id']}/roster",
        json={"contestant_ids": [str(c["id"])]},
    )
    assert r.status_code == 200, r.text
    assert r.json()[0]["league_season_id"] == other_ls["id"]

    # Standings: the default league lists its members; Camp B lists only its own.
    names = {
        e["display_name"]
        for e in client.get(
            f"/league-seasons/{season['league_season_id']}/standings"
        ).json()
    }
    assert rival["display_name"] in names
    names = {
        e["display_name"]
        for e in client.get(f"/league-seasons/{other_ls['id']}/standings").json()
    }
    assert names == {current_user["display_name"]}


@pytest.mark.integration
def test_whos_in_reports_done_or_not(client, db_conn, current_user):
    """Tribe gaps count a castaway already out; ballot and advantage are flags."""
    season = insert_season(db_conn)
    ls_id = league_season_id(db_conn, season["id"])
    with db_conn.cursor() as cur:
        cur.execute(
            "update league_seasons set roster_size = 2, roster_lock_episode = 1"
            " where id = %s",
            [ls_id],
        )
    a = insert_contestant(db_conn, season["id"], name="A")
    b = insert_contestant(db_conn, season["id"], name="B")
    ep1 = insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    insert_elimination(db_conn, ep1["id"], a["id"])
    insert_roster_pick(db_conn, current_user["id"], season["id"], a["id"])
    insert_roster_pick(db_conn, current_user["id"], season["id"], b["id"])
    insert_elimination_pick(db_conn, current_user["id"], ep2["id"], b["id"])
    insert_advantage_play(
        db_conn, current_user["id"], ep2["id"], "double_roster_points"
    )
    idle = insert_user(db_conn, display_name="Idle")

    r = client.get(f"/league-seasons/{ls_id}/whos-in")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["episode_number"] == 2
    rows = {m["user_id"]: m for m in body["members"]}
    me = rows[str(current_user["id"])]
    assert (me["tribe_missing"], me["has_ballot"], me["played_advantage"]) == (
        1,
        True,
        True,
    )
    them = rows[str(idle["id"])]
    assert (them["tribe_missing"], them["has_ballot"], them["played_advantage"]) == (
        2,
        False,
        False,
    )
