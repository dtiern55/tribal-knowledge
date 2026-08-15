"""Merging survivoR's two cast files into a bio (#262)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from load_bios import merge_bios  # noqa: E402

CASTAWAYS = [
    {
        "version_season": "US37",
        "castaway_id": "US0500",
        "castaway": "Nick",
        "full_name": "Nick Wilson",
        "age": 27,
        "city": "Williamsburg",
        "state": "Kentucky",
    },
    {
        "version_season": "US37",
        "castaway_id": "US0501",
        "castaway": "Bi",
        "full_name": "Bi Nguyen",
        "age": 28,
        "city": None,
        "state": None,
    },
    {
        "version_season": "US28",
        "castaway_id": "US0400",
        "castaway": "Tony",
        "full_name": "Tony Vlachos",
        "age": 39,
        "city": "Jersey City",
        "state": "New Jersey",
    },
]
DETAILS = [
    {"castaway_id": "US0500", "occupation": "Public Defender;Attorney"},
    {"castaway_id": "US0501", "occupation": None},
]


def test_joins_occupation_and_keeps_only_the_headline_job():
    bios = merge_bios(CASTAWAYS, DETAILS, 37)
    assert bios["nick wilson"] == {
        "age": 27,
        "occupation": "Public Defender",
        "hometown": "Williamsburg, Kentucky",
    }


def test_short_and_full_names_both_resolve():
    bios = merge_bios(CASTAWAYS, DETAILS, 37)
    assert bios["nick"] == bios["nick wilson"]


def test_missing_pieces_are_none_rather_than_blank_strings():
    bios = merge_bios(CASTAWAYS, DETAILS, 37)
    assert bios["bi"] == {"age": 28, "occupation": None, "hometown": None}


def test_other_seasons_are_excluded():
    assert "tony" not in merge_bios(CASTAWAYS, DETAILS, 37)
