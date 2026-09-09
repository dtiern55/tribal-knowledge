"""Redemption Island: a non-final elimination leaves a castaway in the game.

The bots read who's still playing straight from `eliminations`. Dropping the
`is_final` predicate makes someone on Redemption look dead, which buries them
in every ballot and burns a free swap clearing them off a roster.
"""

import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "run_bots", Path(__file__).resolve().parents[1] / "scripts" / "run_bots.py"
)
run_bots = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_bots)


class RecordingCursor:
    """Captures the SQL a helper emits; returns no rows."""

    def __init__(self):
        self.sql = ""

    def execute(self, sql, params=None):
        self.sql = " ".join(sql.split())

    def fetchall(self):
        return []


def test_alive_ids_only_counts_final_eliminations():
    cur = RecordingCursor()
    run_bots.alive_ids(cur, "season-1")
    assert "e.is_final" in cur.sql


def test_finalists_only_counts_final_eliminations():
    cur = RecordingCursor()
    run_bots.finalists(cur, "season-1")
    assert "e.is_final" in cur.sql


def test_redemption_ids_reads_the_island_tribe():
    cur = RecordingCursor()
    run_bots.redemption_ids(cur, "season-1", 3)
    assert "is_redemption" in cur.sql
