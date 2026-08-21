"""Weighted-boots apportionment for the practice-league bot driver."""

import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "run_bots", Path(__file__).resolve().parents[1] / "scripts" / "run_bots.py"
)
run_bots = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_bots)
largest_remainder = run_bots.largest_remainder


def test_apportion_conserves_total_and_tracks_weights():
    # Danny's ep6 read across 36 non-contrarian pick slots.
    out = largest_remainder([14, 12, 6, 5, 5], 36)
    assert sum(out) == 36
    assert out == [12, 10, 5, 5, 4]  # steep top, flat tail — held, not collapsed


def test_apportion_edges():
    assert largest_remainder([], 10) == []
    assert largest_remainder([1, 1, 1], 0) == [0, 0, 0]
    assert largest_remainder([0, 0], 5) == [0, 0]  # no weight, no slots handed out
    assert sum(largest_remainder([3, 1], 7)) == 7  # remainder never leaks
