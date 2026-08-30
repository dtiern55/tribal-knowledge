"""Bot finale-bracket slate: Sole Survivor as winner (mostly), the rest random."""

import importlib.util
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "run_bots", Path(__file__).resolve().parents[1] / "scripts" / "run_bots.py"
)
run_bots = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_bots)
finale_slate = run_bots.finale_slate

POOL = ["a", "b", "c", "d", "e", "f"]


def test_slate_is_a_valid_nested_bracket():
    for i in range(50):
        f4, f3, w = finale_slate(POOL, "a", spread=1.0, uid=f"bot-{i}")
        assert len(f4) == 4 and len(set(f4)) == 4
        assert len(f3) == 3 and len(set(f3)) == 3
        assert set(f3) <= set(f4)
        assert w in f3 and w in f4  # a called winner also fills their F3/F4
        assert all(c in POOL for c in f4)


def test_most_but_not_all_crown_their_sole_survivor():
    crowned = sum(
        finale_slate(POOL, "a", 1.0, f"bot-{i}")[2] == "a" for i in range(300)
    )
    # "if still available, most should" — a clear majority, but not everyone.
    assert 150 < crowned < 300


def test_an_eliminated_designee_is_never_the_winner():
    # SS "z" isn't in the finalist pool (voted out earlier): the winner comes
    # from the pool instead, every time.
    for i in range(50):
        _, _, w = finale_slate(POOL, "z", 1.0, f"bot-{i}")
        assert w != "z" and w in POOL
