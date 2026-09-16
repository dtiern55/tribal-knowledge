"""The importer's self-check covers swaps, merge, holding pens, the episode bound."""

from app.tribe_import import _demo


def test_tribe_import_self_check() -> None:
    _demo()
