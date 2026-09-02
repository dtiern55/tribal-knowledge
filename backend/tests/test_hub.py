"""The locked-state league Hub (#490): reveal the whole field at lock, never before."""

from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_advantage_play,
    insert_contestant,
    insert_elimination_pick,
    insert_episode,
    insert_roster_pick,
    insert_scoring_event,
    insert_season,
    insert_user,
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
    insert_roster_pick(db_conn, current_user["id"], season["id"], boot["id"])
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

    # A player with only a roster and no ballot still appears; a no-show doesn't.
    insert_user(db_conn, display_name="NoShow")
    rows = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/hub"
    ).json()
    assert "NoShow" not in {r["display_name"] for r in rows}


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
