"""The wiki profile parser behind scripts/load_bio_qa.py."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from load_bio_qa import parse_profile, profile_tabs  # noqa: E402

WIKITEXT = """{{Infobox}}'''Michael "Mike" Pinsky''' is a castaway from {{S|51}}.
==Profile==
''Retrieved from EW.com''

'''Age:''' 32 <br />
'''Hometown:''' New York City <br />
'''Occupation:''' Baseball Executive <br />
'''3 Words to Describe You:''' Enthusiastic, strategic, driven <br />
'''Previous player you identify with?:''' [[Kyle Fraser]] and [[Adam Klein|Adam]].<br />
'''What will you value in an alliance partner?: '''Information is king. <br />
'''Pet Peeves:''' Misused words &amp; under seasoned food. <br />
'''Birthdate:''' May 10 <br />
==Survivor==
'''Not a question:''' this is outside the profile
"""

TABBED = """==Profile==
''Retrieved from CBS.com''
{|
| <tabber>All-Stars=
'''Previous Finish:''' Sole Survivor<br />
'''Hobbies:''' Backgammon<br />
|-|Blood vs. Water=
'''Name (Age):''' Tina Wesson (52)<br />
'''Tribe Designation:''' {{tribehl5|galang|Galang|Returning Player}}<br />
'''Relationship to Significant Castaway:''' [[Katie Collins|Katie]]'s Mother<br />
'''Previous Season:''' {{S|alt2}} – winner<br />
'''Why Did You Want to Return?:''' To play with Katie.<br />
</tabber>
|}
"""


def test_parse_profile_extracts_questions_and_cleans_markup():
    assert parse_profile(profile_tabs(WIKITEXT)[""]) == [
        {
            "question": "3 Words to Describe You",
            "answer": "Enthusiastic, strategic, driven",
        },
        {
            "question": "Previous player you identify with?",
            "answer": "Kyle Fraser and Adam.",
        },
        {
            "question": "What will you value in an alliance partner?",
            "answer": "Information is king.",
        },
        {"question": "Pet Peeves", "answer": "Misused words & under seasoned food."},
    ]


def test_parse_profile_without_profile_section():
    assert profile_tabs("nothing here") == {"": ""}
    assert parse_profile("") == []


def test_multi_season_page_reads_one_tab_and_drops_finishes():
    tabs = profile_tabs(TABBED)
    assert sorted(tabs) == ["All-Stars", "Blood vs. Water"]
    assert parse_profile(tabs["Blood vs. Water"]) == [
        {"question": "Tribe Designation", "answer": "Galang, Returning Player"},
        {
            "question": "Relationship to Significant Castaway",
            "answer": "Katie's Mother",
        },
        {"question": "Why Did You Want to Return?", "answer": "To play with Katie."},
    ]
