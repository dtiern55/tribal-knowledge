import uuid

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
)


@pytest.mark.integration
def test_latest_reveal_reconciles_multiple_correct_picks_and_double_vote(
    client, db_conn, current_user
):
    season = insert_season(
        db_conn, status="active", roster_lock_episode=1, merge_episode=7
    )
    episode = insert_episode(db_conn, season["id"], status="scored")
    rostered = insert_contestant(db_conn, season["id"], "Rostered")
    boots = [
        insert_contestant(db_conn, season["id"], "Boot One"),
        insert_contestant(db_conn, season["id"], "Boot Two"),
    ]
    miss = insert_contestant(db_conn, season["id"], "Safe")
    insert_roster_pick(db_conn, current_user["id"], season["id"], rostered["id"])
    insert_scoring_event(
        db_conn, episode["id"], rostered["id"], "win_individual_immunity"
    )
    for contestant in [*boots, miss]:
        insert_elimination_pick(
            db_conn, current_user["id"], episode["id"], contestant["id"]
        )
    for contestant in boots:
        insert_elimination(db_conn, episode["id"], contestant["id"])
    play = insert_advantage_play(
        db_conn, current_user["id"], episode["id"], "double_vote_points"
    )

    response = client.get(f"/league-seasons/{season['league_season_id']}/reveal")
    assert response.status_code == 200
    result = response.json()
    assert result["episode_id"] == str(episode["id"])
    assert len(result["eliminated"]) == 2
    assert [pick["correct"] for pick in result["ballot"]] == [True, True, False]
    assert result["roster_points"] == 15
    assert result["ballot_points"] == 32
    assert result["weekly_play_bonus"] == 32
    assert result["weekly_plays"] == [
        {
            "advantage_play_id": str(play["id"]),
            "advantage_type": "double_vote_points",
            "target_contestant_id": None,
            "target_name": None,
            "bonus_points": 32,
        }
    ]
    assert result["total_points"] == 79
    assert (
        result["roster_points"]
        + result["roster_adjustment_points"]
        + result["ballot_points"]
        + result["weekly_play_bonus"]
        == result["total_points"]
    )


@pytest.mark.integration
def test_roster_breakdown_lists_base_events_only(client, db_conn, current_user):
    """The breakdown itemizes base scoring events (#473); a played Double
    Roster Points bonus stays in the Weekly-play lane exactly as before —
    it must not appear on the roster row or its breakdown.
    """
    season = insert_season(db_conn, status="active", roster_lock_episode=1)
    episode = insert_episode(db_conn, season["id"], status="scored")
    rostered = insert_contestant(db_conn, season["id"], "Rostered")
    insert_roster_pick(db_conn, current_user["id"], season["id"], rostered["id"])
    insert_scoring_event(
        db_conn, episode["id"], rostered["id"], "win_individual_immunity"
    )
    play = insert_advantage_play(
        db_conn,
        current_user["id"],
        episode["id"],
        "double_roster_points",
        target_contestant_id=rostered["id"],
    )

    result = client.get(f"/league-seasons/{season['league_season_id']}/reveal").json()
    member = result["roster"][0]
    assert member["contestant_id"] == str(rostered["id"])
    assert member["points"] == 15
    assert member["breakdown"] == [
        {
            "event_type": "win_individual_immunity",
            "label": "Win individual immunity",
            "quantity": 1,
            "points": 15,
        },
    ]
    assert sum(line["points"] for line in member["breakdown"]) == member["points"]
    assert result["roster_points"] == 15
    assert result["weekly_plays"] == [
        {
            "advantage_play_id": str(play["id"]),
            "advantage_type": "double_roster_points",
            "target_contestant_id": str(rostered["id"]),
            "target_name": "Rostered",
            "bonus_points": 15,
        }
    ]
    assert result["weekly_play_bonus"] == 15
    assert (
        result["roster_points"]
        + result["roster_adjustment_points"]
        + result["ballot_points"]
        + result["weekly_play_bonus"]
        == result["total_points"]
    )


@pytest.mark.integration
def test_acknowledgement_is_idempotent_and_replay_does_not_change_it(
    client, db_conn, current_user
):
    season = insert_season(db_conn, status="active", roster_lock_episode=1)
    first = insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    latest = insert_episode(db_conn, season["id"], episode_number=2, status="scored")

    replay = client.get(
        f"/league-seasons/{season['league_season_id']}/episode-results/{first['id']}"
    )
    assert replay.status_code == 200
    assert client.get(f"/league-seasons/{season['league_season_id']}/reveal").json()[
        "episode_id"
    ] == str(latest["id"])

    url = f"/league-seasons/{season['league_season_id']}/reveal-acknowledgement"
    first_ack = client.post(url, json={"episode_id": str(latest["id"])})
    duplicate = client.post(url, json={"episode_id": str(latest["id"])})
    assert first_ack.status_code == duplicate.status_code == 200
    assert first_ack.json() == duplicate.json()
    assert (
        client.get(f"/league-seasons/{season['league_season_id']}/reveal").status_code
        == 204
    )

    # A later history replay and an older acknowledgement cannot rewind state.
    assert (
        client.get(
            f"/league-seasons/{season['league_season_id']}/episode-results/{first['id']}"
        ).status_code
        == 200
    )
    older = client.post(url, json={"episode_id": str(first["id"])})
    assert older.json()["episode_id"] == str(latest["id"])
    assert (
        client.get(f"/league-seasons/{season['league_season_id']}/reveal").status_code
        == 204
    )


@pytest.mark.integration
def test_only_latest_missed_result_is_offered(client, db_conn):
    season = insert_season(db_conn, status="active", roster_lock_episode=2)
    # Episode 1 is watch-only; episodes 2 and 3 are playable.
    insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    insert_episode(db_conn, season["id"], episode_number=2, status="scored")
    latest = insert_episode(db_conn, season["id"], episode_number=3, status="scored")
    result = client.get(f"/league-seasons/{season['league_season_id']}/reveal").json()
    assert result["episode_id"] == str(latest["id"])


@pytest.mark.integration
def test_completed_season_and_watch_only_premiere_do_not_auto_reveal(client, db_conn):
    completed = insert_season(db_conn, status="completed", roster_lock_episode=1)
    old_episode = insert_episode(db_conn, completed["id"], status="scored")
    assert (
        client.get(
            f"/league-seasons/{completed['league_season_id']}/reveal"
        ).status_code
        == 204
    )
    assert (
        client.get(
            f"/league-seasons/{completed['league_season_id']}/episode-results/{old_episode['id']}"
        ).status_code
        == 200
    )

    active = insert_season(db_conn, status="active", roster_lock_episode=2)
    premiere = insert_episode(db_conn, active["id"], status="scored")
    assert (
        client.get(f"/league-seasons/{active['league_season_id']}/reveal").status_code
        == 204
    )
    assert (
        client.get(
            f"/league-seasons/{active['league_season_id']}/episode-results/{premiere['id']}"
        ).status_code
        == 404
    )


@pytest.mark.integration
def test_finale_result_includes_three_part_ballot_and_rank_movement(
    client, db_conn, current_user
):
    # A newly completed season is still eligible; the rollout migration, not
    # status alone, suppresses old completed-season reveals.
    season = insert_season(db_conn, status="completed", roster_lock_episode=1)
    other = insert_user(db_conn, display_name="A Leader")
    prior = insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    finale = insert_episode(
        db_conn, season["id"], episode_number=2, status="scored", is_finale=True
    )
    ours = insert_contestant(db_conn, season["id"], "Ours")
    theirs = insert_contestant(db_conn, season["id"], "Theirs")
    early = insert_contestant(db_conn, season["id"], "Early", placement=5)
    fire = insert_contestant(db_conn, season["id"], "Fire", placement=4)
    third = insert_contestant(db_conn, season["id"], "Third", placement=3)
    runner = insert_contestant(db_conn, season["id"], "Runner", placement=2)
    winner = insert_contestant(db_conn, season["id"], "Winner", placement=1)
    insert_roster_pick(db_conn, current_user["id"], season["id"], ours["id"])
    insert_roster_pick(db_conn, other["id"], season["id"], theirs["id"])
    insert_scoring_event(db_conn, prior["id"], theirs["id"], "win_individual_immunity")
    insert_finale_prediction(
        db_conn,
        current_user["id"],
        season["id"],
        final_four=[winner["id"], runner["id"], third["id"], fire["id"]],
        final_three=[winner["id"], runner["id"], third["id"]],
        winner=winner["id"],
    )
    insert_elimination(db_conn, finale["id"], early["id"], "voted_out")
    insert_elimination(db_conn, finale["id"], fire["id"], "fire_making_loss")

    result = client.get(f"/league-seasons/{season['league_season_id']}/reveal").json()
    assert [pick["prediction_type"] for pick in result["ballot"]] == [
        "final_four",
        "final_four",
        "final_four",
        "final_four",
        "final_three",
        "final_three",
        "final_three",
        "winner",
        "perfect_final_three",
    ]
    # 4*6 + 3*8 + 40 + 12 (perfect Final 3) — the perfect bonus rides the first
    # Final 3 pick's line so the ballot lane still sums to the total.
    assert result["ballot_points"] == 100
    assert result["total_points"] == 100
    assert result["current_rank"] == 1
    assert result["prior_rank"] == 2
    assert result["rank_delta"] == 1


@pytest.mark.integration
def test_reveal_routes_require_authentication(unauth_client):
    season_id = uuid.uuid4()
    episode_id = uuid.uuid4()
    assert unauth_client.get(f"/league-seasons/{season_id}/reveal").status_code == 401
    assert (
        unauth_client.get(
            f"/league-seasons/{season_id}/episode-results/{episode_id}"
        ).status_code
        == 401
    )
    assert (
        unauth_client.post(
            f"/league-seasons/{season_id}/reveal-acknowledgement",
            json={"episode_id": str(episode_id)},
        ).status_code
        == 401
    )
