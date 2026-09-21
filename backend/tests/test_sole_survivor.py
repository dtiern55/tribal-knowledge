"""Sole Survivor mode (#164): designation rules and the finale double."""

from datetime import datetime, timedelta, timezone

import pytest

from app import scoring
from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_roster_pick,
    insert_scoring_event,
    insert_season,
    insert_user,
)

PAST = datetime.now(timezone.utc) - timedelta(hours=1)


def _ss_season(conn, **kwargs):
    # SS designation rides the swap lock (one dial, no merge). merge_episode is
    # set only so the finale's post-merge scoring applies.
    return insert_season(conn, roster_lock_episode=1, merge_episode=1, **kwargs)


@pytest.mark.integration
def test_finale_double_and_additive_placements(client, db_conn, current_user):
    """Designee's finale contribution earns +50%: events and stacked placement
    values; the non-designated finalist earns base placement points."""
    season = _ss_season(db_conn, swap_lock_episode=4)
    insert_episode(db_conn, season["id"], episode_number=3)  # open: designation ok
    fin = insert_episode(
        db_conn, season["id"], episode_number=5, is_finale=True, picks_lock_at=PAST
    )
    a = insert_contestant(db_conn, season["id"], "Designee", placement=1)
    b = insert_contestant(db_conn, season["id"], "Runner", placement=2)
    insert_roster_pick(db_conn, current_user["id"], season["id"], a["id"])
    insert_roster_pick(db_conn, current_user["id"], season["id"], b["id"])

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/sole-survivor",
        json={"contestant_id": str(a["id"])},
    )
    assert r.status_code == 200
    assert r.json()["is_sole_survivor"] is True

    insert_scoring_event(db_conn, fin["id"], a["id"], "win_individual_immunity")

    # Designee: 15 event + 25 MFT + 40 won_season = 80 base, +50% = 40.
    # Runner: 25 MFT alone — runner-up was retired (#881). 120 + 25 = 145.
    assert scoring.roster_points(db_conn, season["league_season_id"]) == {
        str(current_user["id"]): 145
    }
    by_c = scoring.roster_points_by_contestant(
        db_conn, season["league_season_id"], current_user["id"]
    )
    assert by_c[str(a["id"])] == 120
    assert by_c[str(b["id"])] == 25
    # Per-contestant always reconciles with the user total.
    assert sum(by_c.values()) == 145


@pytest.mark.integration
def test_designation_rules(client, db_conn, current_user):
    season = _ss_season(db_conn, swap_lock_episode=4)
    ep1 = insert_episode(
        db_conn, season["id"], episode_number=1, status="scored", picks_lock_at=PAST
    )
    insert_episode(db_conn, season["id"], episode_number=3)
    a = insert_contestant(db_conn, season["id"], "A")
    b = insert_contestant(db_conn, season["id"], "B")
    off_roster = insert_contestant(db_conn, season["id"], "Bench")
    dead = insert_contestant(db_conn, season["id"], "Booted")
    insert_roster_pick(db_conn, current_user["id"], season["id"], a["id"])
    insert_roster_pick(db_conn, current_user["id"], season["id"], b["id"])
    insert_roster_pick(db_conn, current_user["id"], season["id"], dead["id"])
    insert_elimination(db_conn, ep1["id"], dead["id"])

    url = f"/league-seasons/{season['league_season_id']}/sole-survivor"
    r = client.post(url, json={"contestant_id": str(off_roster["id"])})
    assert r.status_code == 400  # not on the active roster

    # Eliminated but never swapped out: still on the roster, not designatable (#180)
    r = client.post(url, json={"contestant_id": str(dead["id"])})
    assert r.status_code == 400
    assert "eliminated" in r.json()["detail"]

    assert client.post(url, json={"contestant_id": str(a["id"])}).status_code == 200
    # Re-designation before lock replaces, never duplicates.
    assert client.post(url, json={"contestant_id": str(b["id"])}).status_code == 200
    roster = client.get(
        f"/league-seasons/{season['league_season_id']}/roster/{current_user['id']}"
    ).json()
    flags = {p["contestant_id"]: p["is_sole_survivor"] for p in roster}
    assert flags == {str(a["id"]): False, str(b["id"]): True, str(dead["id"]): False}

    # Window closes once the last swappable episode (swap lock - 1 = 3) locks.
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = now() - interval '1 hour'"
            " where season_id = %s and episode_number = 3",
            [str(season["id"])],
        )
    r = client.post(url, json={"contestant_id": str(a["id"])})
    assert r.status_code == 400
    assert "locked" in r.json()["detail"]


@pytest.mark.integration
def test_designation_opens_going_into_the_lock_episode(client, db_conn, current_user):
    """No merge gate (one dial): the pick opens going into the last swappable
    episode (swap lock - 1) and not before."""
    season = insert_season(db_conn, roster_lock_episode=1, swap_lock_episode=8)
    insert_episode(
        db_conn, season["id"], episode_number=1, status="scored", picks_lock_at=PAST
    )
    insert_episode(
        db_conn, season["id"], episode_number=2
    )  # open, well before the lock
    insert_episode(db_conn, season["id"], episode_number=7)  # last swappable (lock - 1)
    insert_episode(db_conn, season["id"], episode_number=8)  # the swap lock
    a = insert_contestant(db_conn, season["id"], "A")
    insert_roster_pick(db_conn, current_user["id"], season["id"], a["id"])
    url = f"/league-seasons/{season['league_season_id']}/sole-survivor"

    # ep2 is open — too early, the pick has not opened yet.
    r = client.post(url, json={"contestant_id": str(a["id"])})
    assert r.status_code == 400
    assert "opened" in r.json()["detail"].lower()

    # Score ep2 so ep7 (swap lock - 1) becomes the open episode.
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set status = 'scored'"
            " where season_id = %s and episode_number = 2",
            [str(season["id"])],
        )
    assert client.post(url, json={"contestant_id": str(a["id"])}).status_code == 200


@pytest.mark.integration
def test_designation_hidden_from_others_until_lock(client, db_conn, current_user):
    """The flag is strategy until the designation locks — the roster may be
    visible while the flag is masked."""
    season = _ss_season(db_conn, swap_lock_episode=4)
    insert_episode(
        db_conn, season["id"], episode_number=1, status="scored", picks_lock_at=PAST
    )
    insert_episode(db_conn, season["id"], episode_number=3)  # swap lock still open
    other = insert_user(db_conn, display_name="Other")
    a = insert_contestant(db_conn, season["id"], "A")
    insert_roster_pick(db_conn, other["id"], season["id"], a["id"])
    with db_conn.cursor() as cur:
        cur.execute(
            "update roster_picks set is_sole_survivor = true where user_id = %s",
            [str(other["id"])],
        )

    url = f"/league-seasons/{season['league_season_id']}/roster/{other['id']}"
    assert [p["is_sole_survivor"] for p in client.get(url).json()] == [False]

    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = now() - interval '1 hour'"
            " where season_id = %s and episode_number = 3",
            [str(season["id"])],
        )
    assert [p["is_sole_survivor"] for p in client.get(url).json()] == [True]


@pytest.mark.integration
def test_ss_lock_defaults_to_episode_8(client, db_conn, current_user):
    """No swap lock set falls back to episode 8 (no jury stipulation): the pick
    opens going into ep7 and locks when ep7 locks — same as the swaps."""
    season = insert_season(db_conn, roster_lock_episode=1)  # no swap_lock -> default 8
    insert_episode(
        db_conn, season["id"], episode_number=6, status="scored", picks_lock_at=PAST
    )
    insert_episode(db_conn, season["id"], episode_number=7)  # last swappable, open
    insert_episode(db_conn, season["id"], episode_number=8)  # the default lock
    a = insert_contestant(db_conn, season["id"], "A")
    insert_roster_pick(db_conn, current_user["id"], season["id"], a["id"])
    url = f"/league-seasons/{season['league_season_id']}/sole-survivor"

    # ep7 (default lock - 1) is open, so the pick is open.
    assert client.post(url, json={"contestant_id": str(a["id"])}).status_code == 200

    # Once ep7 locks, the pick locks with the swaps.
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = now() - interval '1 hour'"
            " where season_id = %s and episode_number = 7",
            [str(season["id"])],
        )
    r = client.post(url, json={"contestant_id": str(a["id"])})
    assert r.status_code == 400
    assert "locked" in r.json()["detail"]
