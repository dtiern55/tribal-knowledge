"""Sole Survivor mode (#164): designation rules and the finale double."""

from datetime import datetime, timedelta, timezone

import pytest

from app import scoring
from tests.helpers import (
    insert_contestant,
    insert_episode,
    insert_roster_pick,
    insert_scoring_event,
    insert_season,
    insert_user,
    insert_winner_pick,
)

PAST = datetime.now(timezone.utc) - timedelta(hours=1)


def _ss_season(conn, **kwargs):
    return insert_season(
        conn, winner_mode="sole_survivor", roster_lock_episode=1, **kwargs
    )


@pytest.mark.integration
def test_finale_double_and_additive_placements(client, db_conn, current_user):
    """Designee's finale contribution doubles: events and stacked placement
    values; the non-designated finalist earns base placement points."""
    season = _ss_season(db_conn, ss_lock_episode=3)
    insert_episode(db_conn, season["id"], episode_number=3)  # open: designation ok
    fin = insert_episode(
        db_conn, season["id"], episode_number=5, is_finale=True, picks_lock_at=PAST
    )
    a = insert_contestant(db_conn, season["id"], "Designee", placement=1)
    b = insert_contestant(db_conn, season["id"], "Runner", placement=2)
    insert_roster_pick(db_conn, current_user["id"], season["id"], a["id"])
    insert_roster_pick(db_conn, current_user["id"], season["id"], b["id"])

    r = client.post(
        f"/seasons/{season['id']}/sole-survivor", json={"contestant_id": str(a["id"])}
    )
    assert r.status_code == 200
    assert r.json()["is_sole_survivor"] is True

    # 15-point finale event for the designee -> 30 with the double.
    insert_scoring_event(db_conn, fin["id"], a["id"], "win_individual_immunity")

    # Designee: (15 event + 10 MFT + 20 SS win) * 2 = 90.
    # Runner: 10 MFT + 10 runner-up = 20. Total 110.
    assert scoring.roster_points(db_conn, season["id"]) == {
        str(current_user["id"]): 110
    }
    by_c = scoring.roster_points_by_contestant(
        db_conn, season["id"], current_user["id"]
    )
    assert by_c[str(a["id"])] == 90
    assert by_c[str(b["id"])] == 20


@pytest.mark.integration
def test_winner_points_zero_in_ss_mode(db_conn, current_user):
    season = _ss_season(db_conn)
    winner = insert_contestant(db_conn, season["id"], "Winner", placement=1)
    insert_winner_pick(db_conn, current_user["id"], season["id"], winner["id"])
    assert scoring.winner_points(db_conn, season["id"]) == {}


@pytest.mark.integration
def test_designation_rules(client, db_conn, current_user):
    season = _ss_season(db_conn, ss_lock_episode=3)
    insert_episode(db_conn, season["id"], episode_number=3)
    a = insert_contestant(db_conn, season["id"], "A")
    b = insert_contestant(db_conn, season["id"], "B")
    off_roster = insert_contestant(db_conn, season["id"], "Bench")
    insert_roster_pick(db_conn, current_user["id"], season["id"], a["id"])
    insert_roster_pick(db_conn, current_user["id"], season["id"], b["id"])

    url = f"/seasons/{season['id']}/sole-survivor"
    r = client.post(url, json={"contestant_id": str(off_roster["id"])})
    assert r.status_code == 400  # not on the active roster

    assert client.post(url, json={"contestant_id": str(a["id"])}).status_code == 200
    # Re-designation before lock replaces, never duplicates.
    assert client.post(url, json={"contestant_id": str(b["id"])}).status_code == 200
    roster = client.get(f"/seasons/{season['id']}/roster/{current_user['id']}").json()
    flags = {p["contestant_id"]: p["is_sole_survivor"] for p in roster}
    assert flags == {str(a["id"]): False, str(b["id"]): True}

    # Window closes with the lock episode.
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = now() - interval '1 hour'"
            " where season_id = %s and episode_number = 3",
            [str(season["id"])],
        )
    r = client.post(url, json={"contestant_id": str(a["id"])})
    assert r.status_code == 400
    assert "closed" in r.json()["detail"]


@pytest.mark.integration
def test_designation_blocked_in_classic_mode(client, db_conn, current_user):
    season = insert_season(db_conn, roster_lock_episode=1, merge_episode=3)
    a = insert_contestant(db_conn, season["id"], "A")
    insert_roster_pick(db_conn, current_user["id"], season["id"], a["id"])
    r = client.post(
        f"/seasons/{season['id']}/sole-survivor", json={"contestant_id": str(a["id"])}
    )
    assert r.status_code == 400
    assert "classic" in r.json()["detail"]


@pytest.mark.integration
def test_designation_hidden_from_others_until_lock(client, db_conn, current_user):
    """The flag is strategy until the designation locks — the roster may be
    visible while the flag is masked."""
    season = _ss_season(db_conn, ss_lock_episode=3)
    insert_episode(db_conn, season["id"], episode_number=1, picks_lock_at=PAST)
    insert_episode(db_conn, season["id"], episode_number=3)  # ss lock still open
    other = insert_user(db_conn, display_name="Other")
    a = insert_contestant(db_conn, season["id"], "A")
    insert_roster_pick(db_conn, other["id"], season["id"], a["id"])
    with db_conn.cursor() as cur:
        cur.execute(
            "update roster_picks set is_sole_survivor = true where user_id = %s",
            [str(other["id"])],
        )

    url = f"/seasons/{season['id']}/roster/{other['id']}"
    assert [p["is_sole_survivor"] for p in client.get(url).json()] == [False]

    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = now() - interval '1 hour'"
            " where season_id = %s and episode_number = 3",
            [str(season["id"])],
        )
    assert [p["is_sole_survivor"] for p in client.get(url).json()] == [True]


@pytest.mark.integration
def test_winner_pick_blocked_in_ss_mode(client, db_conn, current_user):
    season = _ss_season(db_conn, winner_lock_episode=2)
    insert_episode(db_conn, season["id"], episode_number=2)
    a = insert_contestant(db_conn, season["id"], "A")
    r = client.post(
        f"/seasons/{season['id']}/winner-picks",
        json={"winner_contestant_id": str(a["id"])},
    )
    assert r.status_code == 400
    assert "Sole Survivor" in r.json()["detail"]
