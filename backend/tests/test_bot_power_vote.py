"""Which name a bot seals its Power Vote on (#740)."""

import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "run_bots", Path(__file__).resolve().parents[1] / "scripts" / "run_bots.py"
)
run_bots = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_bots)
power_vote_target = run_bots.power_vote_target


def test_a_bot_that_follows_the_read_seals_its_top_rung():
    # Follow 0.0-1.5: the three tight personas per lean.
    for follow in (0.0, 0.8, 1.5):
        assert power_vote_target(follow, "brad", "kat") == "brad"


def test_a_loose_bot_leaves_the_seal_on_the_name_it_bought():
    for follow in (2.5, 8.0):
        assert power_vote_target(follow, "brad", "kat") == "kat"


def test_an_episode_spread_floor_puts_every_bot_on_the_extra_name():
    # Weeks with no read floor `spread` at 100 — nothing to be confident about.
    assert power_vote_target(100.0, "brad", "kat") == "kat"


def test_no_ballot_falls_back_to_the_extra_name():
    assert power_vote_target(0.0, None, "kat") == "kat"
    assert power_vote_target(8.0, "brad", None) is None
