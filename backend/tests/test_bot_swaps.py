"""Who a bot swaps in (#776)."""

import importlib.util
from collections import Counter
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "run_bots", Path(__file__).resolve().parents[1] / "scripts" / "run_bots.py"
)
run_bots = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_bots)

POOL = ["ann", "bob", "cat", "dan"]


def _picks(spread: float, swap_to: set, n: int = 400) -> Counter:
    order = run_bots.swap_in_order(POOL, swap_to, {"ann"}, {})
    return Counter(
        run_bots.biased_order(order, spread, f"bot-{i}", 7, "swapin", "x")[0]
        for i in range(n)
    )


def test_swap_targets_lean_strict_bots_and_let_loose_ones_stray():
    strict = _picks(0, {"cat", "dan"})
    assert set(strict) <= {"cat", "dan"}
    loose = _picks(100, {"cat", "dan"})
    assert loose["cat"] + loose["dan"] > loose["ann"] + loose["bob"] > 0


def test_without_swap_targets_swaps_stay_on_double_targets():
    assert run_bots.swap_in_order(POOL, set(), {"bob"}, {}) == ["bob"]


def test_fewest_owners_first_among_the_named():
    order = run_bots.swap_in_order(POOL, {"cat", "dan"}, set(), {"cat": 3})
    assert order[:2] == ["dan", "cat"]
