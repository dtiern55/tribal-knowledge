"""Redemption Island: still in the game, but not a name you can vote for.

Two different questions the driver has to keep apart. `alive_ids` is who is
still playing, which drives rosters, swaps, doubles and the designation, and
turns on `eliminations.is_final`. `redemption_island_ids` is who cannot be
voted off a tribe this week. Dropping `is_final` collapses the two, buries a
live castaway and burns a free swap clearing them.
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


def test_the_ballot_rule_is_a_separate_question():
    # Redemption is answered from the island tribe, not the eliminations
    # table — the two must not collapse into one predicate.
    cur = RecordingCursor()
    run_bots.redemption_island_ids(cur, 3, ["c1"])
    assert "is_redemption" in cur.sql and "is_final" not in cur.sql
