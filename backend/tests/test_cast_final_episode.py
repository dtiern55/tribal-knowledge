"""A finalist's run ends at the finale, not at an elimination (#532).

survivoR maps `sole survivor` and `runner-up` to no elimination type, so the
import writes those castaways no elimination row. Reading the Cast badge off
`eliminated_in_episode` therefore left exactly the people whose story you most
want — the final three — showing a placement with no episode.
"""

import pytest

from tests.helpers import (
    insert_contestant,
    insert_elimination,
    insert_episode,
    insert_season,
)

pytestmark = pytest.mark.integration


def _cast_by_name(client, season_id):
    return {m["name"]: m for m in client.get(f"/seasons/{season_id}/cast").json()}


def test_finalists_fall_back_to_the_finale_episode(client, db_conn):
    season = insert_season(db_conn, status="completed")
    ep1 = insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    insert_episode(db_conn, season["id"], episode_number=2, status="scored")
    insert_episode(
        db_conn, season["id"], episode_number=3, status="scored", is_finale=True
    )

    insert_contestant(db_conn, season["id"], name="Winner", placement=1)
    insert_contestant(db_conn, season["id"], name="RunnerUp", placement=2)
    juror = insert_contestant(db_conn, season["id"], name="Juror", placement=4)
    insert_elimination(db_conn, ep1["id"], juror["id"])

    cast = _cast_by_name(client, season["id"])

    # No elimination row, so the finale is the only answer.
    assert cast["Winner"]["eliminated_in_episode"] is None
    assert cast["Winner"]["final_episode"] == 3
    assert cast["RunnerUp"]["final_episode"] == 3

    # An elimination still wins over the finale fallback.
    assert cast["Juror"]["final_episode"] == 1


def test_active_castaway_has_no_final_episode(client, db_conn):
    season = insert_season(db_conn, status="active")
    insert_episode(
        db_conn, season["id"], episode_number=1, status="scored", is_finale=True
    )
    insert_contestant(db_conn, season["id"], name="Playing")

    assert _cast_by_name(client, season["id"])["Playing"]["final_episode"] is None


def test_placement_without_a_finale_episode_stays_null(client, db_conn):
    """Placements can land before the finale is flagged; that's a missing
    answer, not a reason to guess at one."""
    season = insert_season(db_conn, status="active")
    insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    insert_contestant(db_conn, season["id"], name="Placed", placement=1)

    assert _cast_by_name(client, season["id"])["Placed"]["final_episode"] is None
