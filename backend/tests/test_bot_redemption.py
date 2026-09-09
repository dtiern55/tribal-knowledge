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


class ScriptedCursor(RecordingCursor):
    """Returns a queued row per fetchone(), recording each statement."""

    def __init__(self, rows):
        super().__init__()
        self.rows = list(rows)
        self.seen = []

    def execute(self, sql, params=None):
        super().execute(sql, params)
        self.seen.append(self.sql)

    def fetchone(self):
        return self.rows.pop(0) if self.rows else None


LEAGUE = {"id": "league-1"}
LS = {"id": "ls-1", "season_id": "s-1"}


def test_a_practice_league_with_real_players_is_allowed():
    # The point of a practice league is humans playing against the bots, so
    # a human member must not disqualify it.
    cur = ScriptedCursor([LEAGUE, {"1": 1}, LS])
    assert run_bots.league_season(cur, "qa", 27) == LS
    assert "p.is_bot" in cur.seen[1] and "is_admin" not in cur.seen[1]


def test_a_league_with_no_bots_is_refused():
    # The real league has no bots enrolled — this is what keeps a stray run
    # off it.
    cur = ScriptedCursor([LEAGUE, None])
    try:
        run_bots.league_season(cur, "Snakes and Rats", 27)
    except SystemExit as e:
        assert "no bots" in str(e)
    else:
        raise AssertionError("expected the run to be refused")


def test_per_league_commands_only_load_that_league_s_bots():
    # A bot that never joined has no roster there; filing a ballot for it
    # invents a player the league does not have.
    cur = RecordingCursor()
    run_bots.load_bots(cur, "league-1")
    assert "league_members" in cur.sql


def test_setup_still_sees_every_bot_account():
    cur = RecordingCursor()
    run_bots.load_bots(cur)
    assert "league_members" not in cur.sql
