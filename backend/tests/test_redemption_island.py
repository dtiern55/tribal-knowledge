"""Redemption Island (#655): a non-final boot scores the ballot but keeps the
castaway in the game; island residents can't be ballot targets."""

from datetime import datetime, timedelta, timezone

import pytest

from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_season,
)


def _tribe(conn, season_id, name, is_redemption=False):
    with conn.cursor() as cur:
        cur.execute(
            "insert into tribes (season_id, name, color, is_redemption)"
            " values (%s, %s, '#000000', %s) returning id",
            [str(season_id), name, is_redemption],
        )
        return cur.fetchone()["id"]


def _assign(conn, contestant_id, tribe_id, from_episode):
    with conn.cursor() as cur:
        cur.execute(
            "insert into contestant_tribes (contestant_id, tribe_id, from_episode)"
            " values (%s, %s, %s)",
            [str(contestant_id), str(tribe_id), from_episode],
        )


@pytest.mark.integration
def test_island_boot_scores_ballot_but_stays_in(client, db_conn, current_user):
    season = insert_season(db_conn)
    ls = season["league_season_id"]
    boot = insert_contestant(db_conn, season["id"], name="Boot")
    insert_contestant(db_conn, season["id"], name="Other")
    ep1 = insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    r = client.post(
        f"/league-seasons/{ls}/episodes/{ep1['id']}/picks",
        json={"contestant_ids": [str(boot["id"])]},
    )
    assert r.status_code == 200, r.text

    # Lock, then record the boot as a Redemption Island exit (not final).
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set picks_lock_at = now() - interval '1 hour'"
            " where id = %s",
            [str(ep1["id"])],
        )
    r = client.post(
        f"/episodes/{ep1['id']}/eliminations",
        json=[
            {
                "contestant_id": str(boot["id"]),
                "elimination_type": "voted_out",
                "is_final": False,
            }
        ],
    )
    assert r.status_code == 200, r.text
    assert r.json()[0]["is_final"] is False

    # Still in the game everywhere "out" is read, and no placement minted.
    cast = {c["name"]: c for c in client.get(f"/seasons/{season['id']}/cast").json()}
    assert cast["Boot"]["eliminated_in_episode"] is None
    assert cast["Boot"]["placement"] is None
    contestants = {
        c["name"]: c for c in client.get(f"/seasons/{season['id']}/contestants").json()
    }
    assert contestants["Boot"]["eliminated_in_episode"] is None

    # ...but the ballot scored it.
    standings = client.get(f"/league-seasons/{ls}/standings").json()
    mine = next(s for s in standings if s["user_id"] == str(current_user["id"]))
    assert mine["total_points"] > 0

    # Losing the duel later is the terminal exit, and it is allowed even though
    # a (non-final) row already exists for this castaway.
    ep2 = insert_episode(
        db_conn,
        season["id"],
        episode_number=2,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    r = client.post(
        f"/episodes/{ep2['id']}/eliminations",
        json=[
            {"contestant_id": str(boot["id"]), "elimination_type": "redemption_loss"}
        ],
    )
    assert r.status_code == 200, r.text
    cast = {c["name"]: c for c in client.get(f"/seasons/{season['id']}/cast").json()}
    assert cast["Boot"]["eliminated_in_episode"] == 2
    assert cast["Other"]["eliminated_in_episode"] is None


@pytest.mark.integration
def test_island_resident_is_not_a_ballot_target(client, db_conn):
    season = insert_season(db_conn)
    ls = season["league_season_id"]
    resident = insert_contestant(db_conn, season["id"], name="Resident")
    insert_contestant(db_conn, season["id"], name="Other")
    insert_contestant(db_conn, season["id"], name="Third")
    island = _tribe(db_conn, season["id"], "Redemption Island", is_redemption=True)
    _assign(db_conn, resident["id"], island, from_episode=1)
    ep1 = insert_episode(
        db_conn,
        season["id"],
        episode_number=1,
        picks_lock_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    insert_elimination(db_conn, ep1["id"], resident["id"], is_final=False)
    with db_conn.cursor() as cur:
        cur.execute(
            "update episodes set status = 'scored' where id = %s", [str(ep1["id"])]
        )
    ep2 = insert_episode(
        db_conn,
        season["id"],
        episode_number=2,
        picks_lock_at=datetime.now(timezone.utc) + timedelta(hours=1),
    )
    r = client.post(
        f"/league-seasons/{ls}/episodes/{ep2['id']}/picks",
        json={"contestant_ids": [str(resident["id"])]},
    )
    assert r.status_code == 400
    assert "Redemption Island" in r.json()["detail"]
    contestants = {
        c["name"]: c for c in client.get(f"/seasons/{season['id']}/contestants").json()
    }
    assert contestants["Resident"]["on_redemption"] is True
    assert contestants["Other"]["on_redemption"] is False
