"""The wiki profile parser behind scripts/load_bio_qa.py."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from load_bio_qa import parse_profile  # noqa: E402

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


def test_parse_profile_extracts_questions_and_cleans_markup():
    assert parse_profile(WIKITEXT) == [
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
    assert parse_profile("nothing here") == []
