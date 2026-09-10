"""How a bot orders the three names it picked (#742)."""

import importlib.util
from collections import Counter
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "run_bots", Path(__file__).resolve().parents[1] / "scripts" / "run_bots.py"
)
run_bots = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_bots)


def _leaders(spread: float, n: int = 400) -> Counter:
    """Who takes rung 1 across n bots, all drawing the same three names."""
    return Counter(
        run_bots.biased_order(
            ["brad", "ciera", "kat"],
            max(spread, run_bots.RUNG_SHUFFLE),
            f"bot-{i}",
            4,
            "rung",
        )[0]
        for i in range(n)
    )


def test_a_lockstep_bot_still_shuffles_its_rungs():
    # Follow 0.0 used to hand rung 1 to the read's leader every single time.
    leaders = _leaders(0.0)
    assert leaders["brad"] < 400
    assert leaders["ciera"] > 0


def test_the_read_still_leads_most_ballots():
    leaders = _leaders(0.0)
    assert 0.6 < leaders["brad"] / 400 < 0.9  # favoured, not guaranteed
    assert leaders["brad"] > leaders["ciera"] > leaders["kat"]


def test_a_loose_bot_keeps_its_own_wider_spread():
    # Follow 8.0 is near a uniform shuffle and the floor must not tighten it.
    leaders = _leaders(8.0)
    assert leaders["brad"] / 400 < 0.6
