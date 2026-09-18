import pytest

from scripts.bot_read import build_entry, resolve

ROSTER = ["Aras Baskauskas", "Laura Morett", "Laura Boneham", "Tyson Apostol"]


def test_lean_flat_favored_with_capped_light():
    e = build_entry(
        "lean", ["Aras Baskauskas", "Laura Morett"], ["Tyson Apostol"], [], "n"
    )
    assert e["spread"] == 0
    assert e["likely_boots"] == [
        ["Aras Baskauskas", 5],
        ["Laura Morett", 5],
        ["Tyson Apostol", 2],
    ]


def test_pileon_spikes_the_top_name():
    e = build_entry("pileon", ["Aras Baskauskas", "Laura Morett"], [], [], "n")
    assert e["likely_boots"] == [["Aras Baskauskas", 12], ["Laura Morett", 4]]
    assert e["spread"] == 0


def test_crapshoot_widens_the_spread():
    assert build_entry("crapshoot", ["Aras Baskauskas"], [], [], "n")["spread"] == 70


def test_resolve_short_names():
    assert resolve("Aras", ROSTER) == "Aras Baskauskas"
    assert resolve("Laura B.", ROSTER) == "Laura Boneham"
    assert resolve("Laura M.", ROSTER) == "Laura Morett"
    with pytest.raises(SystemExit):
        resolve("Laura", ROSTER)  # ambiguous — two Lauras, no initial
    with pytest.raises(SystemExit):
        resolve("Rupert", ROSTER)  # not on this roster


def test_swap_to_is_written_only_when_given():
    assert "swap_targets" not in build_entry("lean", [], [], [], "n")
    e = build_entry("lean", [], [], [], "n", ["Aras Baskauskas"])
    assert e["swap_targets"] == ["Aras Baskauskas"]
