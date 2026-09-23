import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_season,
)


def _open_finale_episode(conn, season_id):
    return insert_episode(
        conn,
        season_id,
        episode_number=13,
        is_finale=True,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )


def _locked_finale_episode(conn, season_id):
    return insert_episode(
        conn,
        season_id,
        episode_number=13,
        is_finale=True,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )


@pytest.mark.integration
def test_submit_and_get_finale_prediction(client, db_conn, current_user):
    season = insert_season(db_conn, status="active")
    cs = [insert_contestant(db_conn, season["id"], f"Player {i}") for i in range(5)]
    _open_finale_episode(db_conn, season["id"])

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={
            "final_four_contestant_ids": [
                str(cs[0]["id"]),
                str(cs[1]["id"]),
                str(cs[2]["id"]),
                str(cs[3]["id"]),
            ],
            "final_three_contestant_ids": [
                str(cs[0]["id"]),
                str(cs[1]["id"]),
                str(cs[2]["id"]),
            ],
            "winner_contestant_id": str(cs[0]["id"]),
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["final_four_contestant_ids"] == [
        str(cs[0]["id"]),
        str(cs[1]["id"]),
        str(cs[2]["id"]),
        str(cs[3]["id"]),
    ]
    assert data["final_three_contestant_ids"] == [
        str(cs[0]["id"]),
        str(cs[1]["id"]),
        str(cs[2]["id"]),
    ]
    assert data["winner_contestant_id"] == str(cs[0]["id"])

    r2 = client.get(
        f"/league-seasons/{season['league_season_id']}/finale-predictions/{current_user['id']}"
    )
    assert r2.status_code == 200
    assert r2.json()["winner_contestant_id"] == str(cs[0]["id"])


@pytest.mark.integration
def test_partial_ballot_allowed(client, db_conn):
    season = insert_season(db_conn, status="active")
    c1 = insert_contestant(db_conn, season["id"], "Player 1")
    _open_finale_episode(db_conn, season["id"])

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={"winner_contestant_id": str(c1["id"])},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["winner_contestant_id"] == str(c1["id"])
    assert data["final_four_contestant_ids"] == []
    assert data["final_three_contestant_ids"] == []


@pytest.mark.integration
def test_dedupes_repeated_pick(client, db_conn):
    season = insert_season(db_conn, status="active")
    c1 = insert_contestant(db_conn, season["id"], "Player 1")
    c2 = insert_contestant(db_conn, season["id"], "Player 2")
    _open_finale_episode(db_conn, season["id"])

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={
            "final_four_contestant_ids": [str(c1["id"]), str(c1["id"]), str(c2["id"])]
        },
    )
    assert r.status_code == 200
    assert r.json()["final_four_contestant_ids"] == [str(c1["id"]), str(c2["id"])]


@pytest.mark.integration
def test_upsert_updates_existing(client, db_conn):
    season = insert_season(db_conn, status="active")
    c1 = insert_contestant(db_conn, season["id"], "Player 1")
    c2 = insert_contestant(db_conn, season["id"], "Player 2")
    _open_finale_episode(db_conn, season["id"])

    client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={"winner_contestant_id": str(c1["id"])},
    )
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={"winner_contestant_id": str(c2["id"])},
    )
    assert r.status_code == 200
    assert r.json()["winner_contestant_id"] == str(c2["id"])


@pytest.mark.integration
def test_get_prediction_not_found(client, db_conn, current_user):
    season = insert_season(db_conn)
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/finale-predictions/{current_user['id']}"
    )
    assert r.status_code == 404


@pytest.mark.integration
def test_other_users_prediction_hidden_until_lock(client, db_conn):
    season = insert_season(db_conn)
    _open_finale_episode(db_conn, season["id"])
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/finale-predictions/{uuid.uuid4()}"
    )
    assert r.status_code == 403


@pytest.mark.integration
def test_other_users_prediction_visible_after_lock(client, db_conn):
    from tests.helpers import insert_finale_prediction, insert_user

    season = insert_season(db_conn)
    insert_episode(
        db_conn,
        season["id"],
        episode_number=13,
        is_finale=True,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    other = insert_user(db_conn, display_name="Other")
    insert_finale_prediction(db_conn, other["id"], season["id"])
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/finale-predictions/{other['id']}"
    )
    assert r.status_code == 200
    assert r.json()["user_id"] == str(other["id"])


@pytest.mark.integration
def test_submit_blocked_no_finale_episode(client, db_conn):
    season = insert_season(db_conn, status="active")
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={},
    )
    assert r.status_code == 400
    assert "not yet scheduled" in r.json()["detail"]


@pytest.mark.integration
def test_submit_blocked_after_lock(client, db_conn):
    season = insert_season(db_conn, status="active")
    _locked_finale_episode(db_conn, season["id"])
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={},
    )
    assert r.status_code == 400
    assert "window" in r.json()["detail"]


@pytest.mark.integration
def test_submit_blocked_completed_season(client, db_conn):
    season = insert_season(db_conn, status="completed")
    _open_finale_episode(db_conn, season["id"])
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={},
    )
    assert r.status_code == 400
    assert "complete" in r.json()["detail"]


@pytest.mark.integration
def test_submit_invalid_contestant(client, db_conn):
    season = insert_season(db_conn, status="active")
    _open_finale_episode(db_conn, season["id"])
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={"winner_contestant_id": str(uuid.uuid4())},
    )
    assert r.status_code == 400
    assert "not in this season" in r.json()["detail"]


@pytest.mark.integration
def test_ballot_rejects_eliminated_contestant(client, db_conn, current_user):
    """#158: ballot fields must name someone still in the game, same as
    weekly picks."""
    season = insert_season(db_conn, status="active")
    gone = insert_contestant(db_conn, season["id"], "Booted")
    alive = insert_contestant(db_conn, season["id"], "Alive")
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    insert_elimination(db_conn, ep2["id"], gone["id"])
    _open_finale_episode(db_conn, season["id"])

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={"final_four_contestant_ids": [str(gone["id"])]},
    )
    assert r.status_code == 400
    assert "eliminated" in r.json()["detail"]

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={"winner_contestant_id": str(alive["id"])},
    )
    assert r.status_code == 200


@pytest.mark.integration
def test_ballot_allows_finale_episode_boots(client, db_conn, current_user):
    """Finale-episode eliminations are what the ballot predicts — they stay
    pickable even when results land before the window closes."""
    season = insert_season(db_conn, status="active")
    finalist = insert_contestant(db_conn, season["id"], "Finale Boot")
    fin = _open_finale_episode(db_conn, season["id"])
    insert_elimination(db_conn, fin["id"], finalist["id"])

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={"final_four_contestant_ids": [str(finalist["id"])]},
    )
    assert r.status_code == 200


@pytest.mark.integration
def test_ballot_allows_redemption_island_resident(client, db_conn, current_user):
    """A vote-out to Redemption Island is not a boot: they can win back in and
    reach the Final 4, so the bracket keeps them pickable."""
    season = insert_season(db_conn, status="active")
    on_island = insert_contestant(db_conn, season["id"], "On Redemption")
    ep2 = insert_episode(db_conn, season["id"], episode_number=2)
    insert_elimination(db_conn, ep2["id"], on_island["id"], is_final=False)
    _open_finale_episode(db_conn, season["id"])

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/finale-predictions",
        json={"final_four_contestant_ids": [str(on_island["id"])]},
    )
    assert r.status_code == 200


@pytest.mark.integration
def test_finale_prediction_slates_must_nest(client, db_conn, current_user):
    """The API enforces the nesting the picker builds in (#884).

    The ladder prices a rung by how far up a slate you got, which only means
    anything if your Final 3 came out of your Final 4. Disjoint slates would
    cover more of the field than a bracket is meant to.
    """
    season = insert_season(db_conn, status="active")
    cs = [insert_contestant(db_conn, season["id"], f"Player {i}") for i in range(6)]
    _open_finale_episode(db_conn, season["id"])
    url = f"/league-seasons/{season['league_season_id']}/finale-predictions"
    four = [str(cs[i]["id"]) for i in range(4)]

    # A Final 3 name that is not on your Final 4.
    r = client.post(
        url,
        json={
            "final_four_contestant_ids": four,
            "final_three_contestant_ids": [four[0], four[1], str(cs[4]["id"])],
        },
    )
    assert r.status_code == 400
    assert "Final 4" in r.json()["detail"]

    # A winner who is not on your Final 3.
    r = client.post(
        url,
        json={
            "final_four_contestant_ids": four,
            "final_three_contestant_ids": four[:3],
            "winner_contestant_id": four[3],
        },
    )
    assert r.status_code == 400
    assert "Final 3" in r.json()["detail"]

    # A part-filled ballot still saves: an empty slate nests trivially.
    r = client.post(
        url,
        json={"final_four_contestant_ids": four[:2], "final_three_contestant_ids": []},
    )
    assert r.status_code == 200


@pytest.mark.integration
def test_scored_prediction_carries_points_per_slate(client, db_conn, current_user):
    """Once placements land, the ballot says what each slate paid (#884)."""
    from tests.helpers import insert_finale_prediction

    season = insert_season(db_conn)
    _locked_finale_episode(db_conn, season["id"])
    miss = insert_contestant(db_conn, season["id"], "Miss", placement=5)
    fourth = insert_contestant(db_conn, season["id"], "Fourth", placement=4)
    third = insert_contestant(db_conn, season["id"], "Third", placement=3)
    second = insert_contestant(db_conn, season["id"], "Second", placement=2)
    insert_contestant(db_conn, season["id"], "First", placement=1)
    insert_finale_prediction(
        db_conn,
        current_user["id"],
        season["id"],
        final_four=[miss["id"], fourth["id"], third["id"], second["id"]],
        final_three=[fourth["id"], third["id"], second["id"]],
        winner=second["id"],
    )
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/finale-predictions/{current_user['id']}"
    )
    # 3 of 4 = 2+4+8, 2 of 3 = 10+20, wrong winner.
    assert r.json()["points"] == {"final_four": 14, "final_three": 30, "winner": 0}
