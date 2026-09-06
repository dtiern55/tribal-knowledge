import uuid
from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_advantage_play,
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_season,
    score_episode,
)


def _open_episode(conn, season_id, episode_number=1, max_picks=3):
    return insert_episode(
        conn,
        season_id,
        episode_number=episode_number,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
        max_elimination_picks=max_picks,
    )


@pytest.mark.integration
def test_get_picks_empty(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks/{current_user['id']}"
    )
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.integration
def test_get_picks_episode_not_found(client):
    r = client.get(
        f"/league-seasons/{uuid.uuid4()}/episodes/{uuid.uuid4()}/picks/{uuid.uuid4()}"
    )
    assert r.status_code == 404


@pytest.mark.integration
def test_submit_picks(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    insert_contestant(db_conn, season["id"], "Player C")  # keep cap above 2
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"]), str(c2["id"])]},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body["picks"]) == 2
    assert body["play"] is None


@pytest.mark.integration
def test_submit_picks_appears_in_get(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    contestant = insert_contestant(db_conn, season["id"])
    insert_contestant(db_conn, season["id"], "Other")  # keep cap above 1
    client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(contestant["id"])]},
    )
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks/{current_user['id']}"
    )
    assert r.status_code == 200
    assert len(r.json()) == 1
    assert r.json()[0]["contestant_id"] == str(contestant["id"])


@pytest.mark.integration
def test_submit_picks_replaces_existing(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"])]},
    )
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c2["id"])]},
    )
    assert r.status_code == 200
    picks = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks/{current_user['id']}"
    ).json()
    assert len(picks) == 1
    assert picks[0]["contestant_id"] == str(c2["id"])


@pytest.mark.integration
def test_resubmit_keeps_existing_picks_created_at(client, db_conn, current_user):
    """#673: take-back trims the *newest* picks, which only means something if
    resubmitting the same name doesn't reinsert it with a fresh timestamp."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    insert_contestant(db_conn, season["id"], "Player C")  # keep cap above 2
    client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"])]},
    )
    first = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks/{current_user['id']}"
    ).json()

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"]), str(c2["id"])]},
    )
    assert r.status_code == 200, r.text
    second = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks/{current_user['id']}"
    ).json()

    kept = next(p for p in second if p["contestant_id"] == str(c1["id"]))
    assert kept["created_at"] == first[0]["created_at"]
    assert kept["id"] == first[0]["id"]


@pytest.mark.integration
def test_submit_picks_too_many(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=1)
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"]), str(c2["id"])]},
    )
    assert r.status_code == 400
    assert "Too many picks" in r.json()["detail"]


@pytest.mark.integration
def test_extra_vote_raises_pick_limit(client, db_conn, current_user):
    """Extra Vote is retired (#307) but its pick-limit machinery is kept, so
    it can come back without being rebuilt. The play is inserted directly
    because the advantage can no longer be chosen from the menu."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=1)
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")
    insert_contestant(db_conn, season["id"], "Player C")  # keeps cap above 2

    insert_advantage_play(db_conn, current_user["id"], ep["id"], "extra_vote")

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"]), str(c2["id"])]},
    )
    assert r.status_code == 200
    assert len(r.json()["picks"]) == 2


@pytest.mark.integration
def test_targeted_double_vote_raises_pick_limit(client, db_conn, current_user):
    """Extra Vote ×2's doubled name is an extra pick on top of the base limit
    (#673), same as extra_vote. Resending doubled_contestant_id unchanged is
    how the ballot save re-confirms an existing play."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=1)
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    doubled = insert_contestant(db_conn, season["id"], "Doubled")
    insert_contestant(db_conn, season["id"], "Player C")  # keeps cap above 2

    insert_advantage_play(
        db_conn, current_user["id"], ep["id"], "double_vote_points", doubled["id"]
    )

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={
            "contestant_ids": [str(c1["id"]), str(doubled["id"])],
            "doubled_contestant_id": str(doubled["id"]),
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["picks"]) == 2
    assert body["play"]["target_contestant_id"] == str(doubled["id"])


@pytest.mark.integration
def test_ballot_save_without_doubled_when_play_present_rejected(
    client, db_conn, current_user
):
    """The ballot save carries the ×2 placement (#673) — a non-empty ballot
    with a play in flight must say which pick it doubles."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=1)
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    doubled = insert_contestant(db_conn, season["id"], "Doubled")
    insert_contestant(db_conn, season["id"], "Player C")  # keeps cap above 2

    insert_advantage_play(
        db_conn, current_user["id"], ep["id"], "double_vote_points", doubled["id"]
    )

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"])]},
    )
    assert r.status_code == 400
    assert "Choose which vote is doubled" in r.json()["detail"]


@pytest.mark.integration
def test_ballot_save_creates_double_vote_play(client, db_conn, current_user):
    """Choosing the ×2 and saving in one step creates the play and all four
    picks — no separate play-then-submit round trip (#673)."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=3)
    names = [insert_contestant(db_conn, season["id"], f"P{i}") for i in range(6)]

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={
            "contestant_ids": [str(c["id"]) for c in names[:4]],
            "doubled_contestant_id": str(names[0]["id"]),
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["picks"]) == 4
    # The play comes back in the same response — no separate GET (#673).
    assert body["play"]["advantage_type"] == "double_vote_points"
    assert body["play"]["target_contestant_id"] == str(names[0]["id"])


@pytest.mark.integration
def test_ballot_save_moves_double_vote_target(client, db_conn, current_user):
    """Saving with a different doubled_contestant_id moves the target with no
    pick side effects (#673)."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=2)
    a = insert_contestant(db_conn, season["id"], "A")
    b = insert_contestant(db_conn, season["id"], "B")
    insert_contestant(db_conn, season["id"], "C")  # keep cap above 2

    insert_advantage_play(
        db_conn, current_user["id"], ep["id"], "double_vote_points", a["id"]
    )
    first = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={
            "contestant_ids": [str(a["id"]), str(b["id"])],
            "doubled_contestant_id": str(a["id"]),
        },
    ).json()

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={
            "contestant_ids": [str(a["id"]), str(b["id"])],
            "doubled_contestant_id": str(b["id"]),
        },
    )
    assert r.status_code == 200, r.text
    second = r.json()
    # Same two picks, same created_at/id — only the play's target moved.
    assert {p["id"] for p in second["picks"]} == {p["id"] for p in first["picks"]}
    assert {p["created_at"] for p in second["picks"]} == {
        p["created_at"] for p in first["picks"]
    }
    assert second["play"]["target_contestant_id"] == str(b["id"])


@pytest.mark.integration
def test_ballot_save_empty_deletes_play_and_picks(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=2)
    a = insert_contestant(db_conn, season["id"], "A")
    insert_contestant(db_conn, season["id"], "B")  # keep cap above 1
    insert_contestant(db_conn, season["id"], "C")

    insert_advantage_play(
        db_conn, current_user["id"], ep["id"], "double_vote_points", a["id"]
    )
    setup = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(a["id"])], "doubled_contestant_id": str(a["id"])},
    )
    assert setup.status_code == 200, setup.text

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": []},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"picks": [], "play": None}


@pytest.mark.integration
def test_ballot_save_doubled_not_on_ballot_rejected(client, db_conn, current_user):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=2)
    a = insert_contestant(db_conn, season["id"], "A")
    off_ballot = insert_contestant(db_conn, season["id"], "OffBallot")

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={
            "contestant_ids": [str(a["id"])],
            "doubled_contestant_id": str(off_ballot["id"]),
        },
    )
    assert r.status_code == 400
    assert "Put the ×2 on one of your names" in r.json()["detail"]


@pytest.mark.integration
def test_ballot_save_replaces_a_roster_double_with_the_ballot_play(
    client, db_conn, current_user
):
    """A roster double is fungible with the ballot's ×2 — choosing the ×2
    moves the week's one play (#307) instead of 409ing, same as a manual
    take-back then play (#673)."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=2)
    a = insert_contestant(db_conn, season["id"], "A")
    rostered = insert_contestant(db_conn, season["id"], "Rostered")

    insert_advantage_play(
        db_conn,
        current_user["id"],
        ep["id"],
        "double_roster_points",
        rostered["id"],
    )

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(a["id"])], "doubled_contestant_id": str(a["id"])},
    )
    assert r.status_code == 200, r.text
    assert r.json()["play"]["advantage_type"] == "double_vote_points"

    plays = client.get(
        f"/league-seasons/{season['league_season_id']}/advantage-plays/{current_user['id']}"
    ).json()
    assert [p["advantage_type"] for p in plays] == ["double_vote_points"]


@pytest.mark.integration
def test_ballot_save_conflicts_with_a_roster_swap_already_spent(
    client, db_conn, current_user
):
    """roster_swap can't be undone (#394, take_back_advantage) — the ballot
    save can't silently drop it the way it can a roster double."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=2)
    a = insert_contestant(db_conn, season["id"], "A")

    insert_advantage_play(db_conn, current_user["id"], ep["id"], "roster_swap")

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(a["id"])], "doubled_contestant_id": str(a["id"])},
    )
    assert r.status_code == 409
    assert "already used your advantage" in r.json()["detail"]


@pytest.mark.integration
def test_ballot_save_too_many_without_doubled(client, db_conn, current_user):
    """Without doubled_contestant_id the base limit applies — no play, no
    extra pick (#673)."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=3)
    names = [insert_contestant(db_conn, season["id"], f"P{i}") for i in range(5)]

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c["id"]) for c in names[:4]]},
    )
    assert r.status_code == 400
    assert "Too many picks: max is 3, got 4" in r.json()["detail"]


@pytest.mark.integration
def test_cannot_pick_every_remaining_option(client, db_conn, current_user):
    """Extra votes never let you select every castaway still in — cap is
    (still in the game − 1), even with a high base limit (#240)."""
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=3)
    c1 = insert_contestant(db_conn, season["id"], "Player A")
    c2 = insert_contestant(db_conn, season["id"], "Player B")  # only 2 still in

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"]), str(c2["id"])]},
    )
    assert r.status_code == 400
    assert "Too many picks" in r.json()["detail"]

    ok = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c1["id"])]},
    )
    assert ok.status_code == 200


@pytest.mark.integration
def test_submit_picks_duplicate_contestant(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"], max_picks=3)
    c = insert_contestant(db_conn, season["id"])
    insert_contestant(db_conn, season["id"], "B")  # keep cap above 2 so the
    insert_contestant(db_conn, season["id"], "C")  # dup check is what fires
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(c["id"]), str(c["id"])]},
    )
    assert r.status_code == 400
    assert "Duplicate" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_scored_episode(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        status="scored",
        picks_lock_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": []},
    )
    assert r.status_code == 400
    assert "locked" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_after_lock_time(client, db_conn):
    season = insert_season(db_conn)
    ep = insert_episode(
        db_conn,
        season["id"],
        picks_lock_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": []},
    )
    assert r.status_code == 400
    assert "locked" in r.json()["detail"]


@pytest.mark.integration
def test_submit_picks_invalid_contestant(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": [str(uuid.uuid4())]},
    )
    assert r.status_code == 400


@pytest.mark.integration
def test_next_episode_stays_shut_until_this_one_is_scored(client, db_conn):
    """#11: an episode that has locked but isn't scored is AIRING, and nothing
    opens behind it — you can't call episode N+1's boot before knowing N's."""
    season = insert_season(db_conn)
    ep1 = insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    ep2 = _open_episode(db_conn, season["id"], episode_number=2)
    c = insert_contestant(db_conn, season["id"])
    insert_contestant(db_conn, season["id"], "B")
    insert_contestant(db_conn, season["id"], "C")

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep2['id']}/picks",
        json={"contestant_ids": [str(c["id"])]},
    )
    assert r.status_code == 400
    assert "no episode is currently open" in r.json()["detail"].lower()

    score_episode(db_conn, ep1["id"])
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep2['id']}/picks",
        json={"contestant_ids": [str(c["id"])]},
    )
    assert r.status_code == 200


@pytest.mark.integration
def test_submit_picks_already_eliminated(client, db_conn):
    season = insert_season(db_conn)
    ep1 = insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    ep2 = _open_episode(db_conn, season["id"], episode_number=2)
    contestant = insert_contestant(db_conn, season["id"])
    insert_contestant(db_conn, season["id"], "B")  # keep others in so the cap
    insert_contestant(db_conn, season["id"], "C")  # isn't what rejects the pick
    insert_elimination(db_conn, ep1["id"], contestant["id"])
    # Episode 2 only opens once episode 1 is scored (#11) — otherwise the
    # rejection would be "nothing is open", not "already eliminated".
    score_episode(db_conn, ep1["id"])
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep2['id']}/picks",
        json={"contestant_ids": [str(contestant["id"])]},
    )
    assert r.status_code == 400
    assert "already eliminated" in r.json()["detail"]


@pytest.mark.integration
def test_submit_empty_picks(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks",
        json={"contestant_ids": []},
    )
    assert r.status_code == 200
    assert r.json() == {"picks": [], "play": None}


@pytest.mark.integration
def test_other_users_picks_hidden_until_lock(client, db_conn):
    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks/{uuid.uuid4()}"
    )
    assert r.status_code == 403


@pytest.mark.integration
def test_other_users_picks_open_at_lock(client, db_conn):
    """Private while picks are open, visible once the episode LOCKS (#36).

    Not once it's scored: nobody can act on a locked pick, and waiting for
    scoring hid the league from itself for the whole episode.
    """
    from tests.helpers import insert_elimination_pick, insert_user

    season = insert_season(db_conn)
    ep = _open_episode(db_conn, season["id"])
    contestant = insert_contestant(db_conn, season["id"])
    other = insert_user(db_conn, display_name="Other")
    insert_elimination_pick(db_conn, other["id"], ep["id"], contestant["id"])

    r = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks/{other['id']}"
    )
    assert r.status_code == 403  # still open for picks

    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = %s where id = %s",
            [datetime.now(timezone.utc) - timedelta(hours=1), ep["id"]],
        )
    r = client.get(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep['id']}/picks/{other['id']}"
    )
    assert r.status_code == 200  # locked, still unscored
    assert len(r.json()) == 1


@pytest.mark.integration
def test_season_picks_batches_own_ballots(client, db_conn, current_user):
    """One request returns every episode's picks, keyed by episode id (#558)."""
    from tests.helpers import insert_elimination_pick

    season = insert_season(db_conn)
    ep1 = _open_episode(db_conn, season["id"], episode_number=1)
    ep2 = _open_episode(db_conn, season["id"], episode_number=2)
    _open_episode(db_conn, season["id"], episode_number=3)  # no picks -> omitted
    c1 = insert_contestant(db_conn, season["id"], "A")
    c2 = insert_contestant(db_conn, season["id"], "B")
    insert_elimination_pick(db_conn, current_user["id"], ep1["id"], c1["id"])
    insert_elimination_pick(db_conn, current_user["id"], ep2["id"], c2["id"])

    r = client.get(
        f"/league-seasons/{season['league_season_id']}/picks/{current_user['id']}"
    )
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {str(ep1["id"]), str(ep2["id"])}
    assert body[str(ep1["id"])][0]["contestant_id"] == str(c1["id"])
    assert body[str(ep2["id"])][0]["contestant_id"] == str(c2["id"])


@pytest.mark.integration
def test_season_picks_hide_other_users_unlocked_episodes(client, db_conn):
    """Batch respects the per-episode rule: another player's picks appear only
    for episodes that have locked — unlocked ones must not leak (#558/#36)."""
    from tests.helpers import insert_elimination_pick, insert_user

    season = insert_season(db_conn)
    locked = insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    open_ep = _open_episode(db_conn, season["id"], episode_number=2)
    contestant = insert_contestant(db_conn, season["id"])
    other = insert_user(db_conn, display_name="Other")
    insert_elimination_pick(db_conn, other["id"], locked["id"], contestant["id"])
    insert_elimination_pick(db_conn, other["id"], open_ep["id"], contestant["id"])

    body = client.get(
        f"/league-seasons/{season['league_season_id']}/picks/{other['id']}"
    ).json()
    assert set(body) == {str(locked["id"])}  # open episode's pick is hidden


@pytest.mark.integration
def test_picks_only_open_for_next_episode(client, db_conn):
    season = insert_season(db_conn)
    _open_episode(db_conn, season["id"], episode_number=1)
    ep2 = _open_episode(db_conn, season["id"], episode_number=2)
    contestant = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep2['id']}/picks",
        json={"contestant_ids": [str(contestant["id"])]},
    )
    assert r.status_code == 400
    assert "only open for episode 1" in r.json()["detail"]


@pytest.mark.integration
def test_watch_only_premiere_rejects_picks(client, db_conn, current_user):
    """Episodes before roster_lock_episode never open for picks (decision #51)."""
    season = insert_season(db_conn, roster_lock_episode=2)
    ep1 = _open_episode(db_conn, season["id"], episode_number=1)
    ep2 = _open_episode(db_conn, season["id"], episode_number=2)
    contestant = insert_contestant(db_conn, season["id"])
    insert_contestant(db_conn, season["id"], "Other")  # keep cap above 1

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep1['id']}/picks",
        json={"contestant_ids": [str(contestant["id"])]},
    )
    assert r.status_code == 400
    assert "only open for episode 2" in r.json()["detail"]

    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep2['id']}/picks",
        json={"contestant_ids": [str(contestant["id"])]},
    )
    assert r.status_code == 200


@pytest.mark.integration
def test_watch_only_premiere_with_no_later_episode(client, db_conn, current_user):
    season = insert_season(db_conn, roster_lock_episode=2)
    ep1 = _open_episode(db_conn, season["id"], episode_number=1)
    contestant = insert_contestant(db_conn, season["id"])
    r = client.post(
        f"/league-seasons/{season['league_season_id']}/episodes/{ep1['id']}/picks",
        json={"contestant_ids": [str(contestant["id"])]},
    )
    assert r.status_code == 400
    assert "No episode is currently open" in r.json()["detail"]
