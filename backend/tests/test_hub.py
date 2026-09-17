"""The locked-state league Hub (#490): reveal the whole field at lock, never before."""

from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_advantage_play,
    insert_contestant,
    insert_elimination,
    insert_elimination_pick,
    insert_episode,
    insert_finale_prediction,
    insert_roster_pick,
    insert_scoring_event,
    insert_season,
    insert_user,
    score_episode,
)


def _episode(conn, season_id, *, locked):
    when = -1 if locked else 1
    return insert_episode(
        conn,
        season_id,
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=when),
    )


@pytest.mark.integration
def test_hub_hidden_until_lock(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _episode(db_conn, season["id"], locked=False)
    assert (
        client.get(
            f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/hub"
        ).status_code
        == 403
    )


@pytest.mark.integration
def test_hub_missing_episode(client):
    from uuid import uuid4

    assert (
        client.get(f"/league-seasons/{uuid4()}/episodes/{uuid4()}/hub").status_code
        == 404
    )


@pytest.mark.integration
def test_hub_reveals_the_field_at_lock(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _episode(db_conn, season["id"], locked=True)
    boot = insert_contestant(db_conn, season["id"], name="Boot")
    other = insert_contestant(db_conn, season["id"], name="Other")

    # Two players both vote the Boot; one also plays a roster double on it.
    p2 = insert_user(db_conn, display_name="Bianca")
    insert_roster_pick(
        db_conn, current_user["id"], season["id"], boot["id"], is_sole_survivor=True
    )
    insert_elimination_pick(db_conn, current_user["id"], ep["id"], boot["id"])
    insert_elimination_pick(db_conn, p2["id"], ep["id"], boot["id"])
    insert_elimination_pick(db_conn, p2["id"], ep["id"], other["id"])
    insert_advantage_play(
        db_conn,
        p2["id"],
        ep["id"],
        "double_roster_points",
        target_contestant_id=boot["id"],
    )

    rows = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/hub"
    ).json()
    by_name = {r["display_name"]: r for r in rows}
    assert set(by_name) >= {"Bianca"}

    bianca = by_name["Bianca"]
    assert {v["name"] for v in bianca["ballot"]} == {"Boot", "Other"}
    assert bianca["advantage_type"] == "double_roster_points"
    assert bianca["advantage_target"]["name"] == "Boot"
    assert bianca["sole_survivor_contestant_id"] is None
    me = by_name[current_user["display_name"]]
    assert me["sole_survivor_contestant_id"] == str(boot["id"])

    # A player with only a roster and no ballot still appears; a no-show doesn't.
    insert_user(db_conn, display_name="NoShow")
    rows = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/hub"
    ).json()
    assert "NoShow" not in {r["display_name"] for r in rows}


@pytest.mark.integration
def test_hub_carries_lane_points_once_scored(client, db_conn, current_user):
    """Scored, each row carries its tribe/ballot lane points — the two numbers
    the recap Field shows per team (#490 recap Field). Null before scoring."""
    from app import scoring

    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        status="scored",
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    boot = insert_contestant(db_conn, season["id"], name="Boot")
    winner = insert_contestant(db_conn, season["id"], name="Winner")

    bianca = insert_user(db_conn, display_name="Bianca")
    insert_roster_pick(db_conn, bianca["id"], season["id"], winner["id"])
    insert_elimination_pick(db_conn, bianca["id"], ep["id"], boot["id"])
    insert_scoring_event(db_conn, ep["id"], winner["id"], "win_individual_immunity")
    insert_elimination(db_conn, ep["id"], boot["id"])
    score_episode(db_conn, ep["id"])

    row = {
        r["display_name"]: r
        for r in client.get(
            f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/hub"
        ).json()
    }["Bianca"]
    assert row["tribe_points"] > 0  # rostered the immunity winner
    assert row["ballot_points"] > 0  # voted the boot correctly
    # The split reconciles with the one-number episode delta the standings use.
    total = scoring.episode_points(db_conn, season["league_season_id"], 1)[
        str(bianca["id"])
    ]
    assert row["tribe_points"] + row["ballot_points"] == total


@pytest.mark.integration
def test_hub_orders_by_standings_not_alphabetical(client, db_conn, current_user):
    """The lock screen lists players in standings order, top score first (#490)."""
    season = insert_season(db_conn)
    ep = _episode(db_conn, season["id"], locked=True)
    boot = insert_contestant(db_conn, season["id"], name="Boot")

    # Aaron sorts first alphabetically but scores nothing; Zed sorts last
    # alphabetically but rosters the immunity winner, so leads the standings.
    aaron = insert_user(db_conn, display_name="Aaron")
    zed = insert_user(db_conn, display_name="Zed")
    insert_elimination_pick(db_conn, aaron["id"], ep["id"], boot["id"])
    insert_elimination_pick(db_conn, zed["id"], ep["id"], boot["id"])
    insert_roster_pick(db_conn, zed["id"], season["id"], boot["id"])
    insert_scoring_event(db_conn, ep["id"], boot["id"], "win_individual_immunity")

    names = [
        r["display_name"]
        for r in client.get(
            f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/hub"
        ).json()
    ]
    assert names.index("Zed") < names.index("Aaron")


@pytest.mark.integration
def test_hub_tribes_as_of_the_episode(client, db_conn, current_user):
    """A row's tribe is who went into this episode: earlier boots and swapped-in
    picks from later drop out; this episode's own boot stays (#802)."""
    season = insert_season(db_conn)
    ep1 = insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    ep2 = insert_episode(
        db_conn,
        season["id"],
        episode_number=2,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    gone = insert_contestant(db_conn, season["id"], name="Gone")
    tonight = insert_contestant(db_conn, season["id"], name="Tonight")
    later = insert_contestant(db_conn, season["id"], name="Later")
    insert_elimination(db_conn, ep1["id"], gone["id"])
    insert_elimination(db_conn, ep2["id"], tonight["id"])

    bianca = insert_user(db_conn, display_name="Bianca")
    for c in (gone, tonight):
        insert_roster_pick(db_conn, bianca["id"], season["id"], c["id"])
    insert_roster_pick(
        db_conn, bianca["id"], season["id"], later["id"], active_from_episode=3
    )

    row = {
        r["display_name"]: r
        for r in client.get(
            f"/league-seasons/{season['league_season_id']}/episodes/{ep2['id']}/hub"
        ).json()
    }["Bianca"]
    assert [s["name"] for s in row["roster"]] == ["Tonight"]


@pytest.mark.integration
def test_hub_shows_the_finale_bracket(client, db_conn, current_user):
    """At the finale the ballot is the bracket, so a row carries it (#801)."""
    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        is_finale=True,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    a, b, c, d = (
        insert_contestant(db_conn, season["id"], name=n) for n in ("A", "B", "C", "D")
    )
    bianca = insert_user(db_conn, display_name="Bianca")
    insert_finale_prediction(
        db_conn,
        bianca["id"],
        season["id"],
        final_four=[a["id"], b["id"], c["id"], d["id"]],
        final_three=[a["id"], b["id"], c["id"]],
        winner=a["id"],
    )

    row = {
        r["display_name"]: r
        for r in client.get(
            f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/hub"
        ).json()
    }["Bianca"]
    finale = row["finale"]
    assert [s["name"] for s in finale["final_four"]] == ["A", "B", "C", "D"]
    assert [s["name"] for s in finale["final_three"]] == ["A", "B", "C"]
    assert finale["winner"]["name"] == "A"
