"""Cast and contestant pages must read the season's snapshot, not the global
template (#282) — otherwise tuning a value rewrites what past seasons display
while the standings, which do read the snapshot, keep the old numbers.
"""

import pytest

from tests.helpers import (
    insert_contestant,
    insert_episode,
    insert_scoring_event,
    insert_season,
)

pytestmark = pytest.mark.integration


def _tune_global_only(db_conn, value):
    """Change the global template without touching any season snapshot."""
    with db_conn.cursor() as cur:
        cur.execute(
            "update scoring_event_types set point_value = %s"
            " where event_type = 'win_individual_immunity'",
            [value],
        )


def test_cast_totals_ignore_global_template_changes(client, db_conn):
    season = insert_season(db_conn, status="active")
    ep = insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    c = insert_contestant(db_conn, season["id"], name="Winner")
    insert_scoring_event(db_conn, ep["id"], c["id"], "win_individual_immunity")

    before = client.get(f"/seasons/{season['id']}/cast").json()[0]["total_points"]
    assert before == 15

    _tune_global_only(db_conn, 99)

    after = client.get(f"/seasons/{season['id']}/cast").json()[0]["total_points"]
    assert (
        after == 15
    ), "cast total followed the global template instead of the snapshot"


def test_contestant_performance_ignores_global_template_changes(client, db_conn):
    season = insert_season(db_conn, status="active")
    ep = insert_episode(db_conn, season["id"], episode_number=1, status="scored")
    c = insert_contestant(db_conn, season["id"], name="Winner")
    insert_scoring_event(db_conn, ep["id"], c["id"], "win_individual_immunity")

    _tune_global_only(db_conn, 99)

    perf = client.get(f"/contestants/{c['id']}/performance").json()
    assert perf["total_points"] == 15
    assert perf["episodes"][0]["events"][0]["points"] == 15
