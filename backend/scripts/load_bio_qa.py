"""Load each castaway's CBS cast questionnaire (the "3 Words to Describe You"
/ "Why will you be the Sole Survivor?" Q&A that CBS releases with the cast)
into contestants.bio_qa, rendered as expandable sections on the contestant
page. The text is the same everywhere it is published; the Survivor fandom
wiki carries it per castaway in a parseable form, so that is the source.

A castaway who played more than once has one profile tab per season on the
wiki; the tab whose label appears in our season's name is read (override
with --tab). Returning players' bios list how they finished earlier seasons;
that loads as written, so pass --skip previous to hold it back for a league
that hasn't watched them.

Dry-runs by default; --apply writes. --skip drops any question whose text
contains the given substring (repeatable).

Usage (from backend/):
    uv run python scripts/load_bio_qa.py 51 --our-season 51 [--apply]
        [--replace] [--skip TEXT] [--tab "Blood vs. Water"]
Env: SUPABASE_URL, SUPABASE_ANON_KEY, PRODUCER_EMAIL/PASSWORD (as
scripts/load_bios.py).
"""

import argparse
import html
import os
import re
import sys

import httpx
from dotenv import load_dotenv

WIKI_API = "https://survivor.fandom.com/api.php"
UA = {"User-Agent": "tribal-knowledge/1.0 (private fantasy league)"}
# Identity lines the profile repeats; they live in their own columns already.
NOT_QUESTIONS = {
    "age",
    "name",
    "name (age)",
    "hometown",
    "current residence",
    "occupation",
    "birthdate",
    "marital status",
}


def _clean(s: str) -> str:
    # A template that survived expansion keeps its last argument.
    s = re.sub(r"\{\{[^{}]*\|([^|{}]+)\}\}", r"\1", s)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", s)  # [[Link|Text]] -> Text
    s = re.sub(r"'''|''", "", s)
    s = re.sub(r"<ref>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    return html.unescape(s).strip()


def profile_tabs(wikitext: str) -> dict[str, str]:
    """The ==Profile== section split by season. A castaway who played more
    than once has one <tabber> tab per season, keyed by the season's subtitle
    ("Blood vs. Water"); a one-season castaway has a single "" tab."""
    profile = wikitext.split("==Profile==", 1)[1] if "==Profile==" in wikitext else ""
    profile = profile.split("\n==", 1)[0]
    m = re.search(r"<tabber>(.*?)</tabber>", profile, re.S)
    if not m:
        return {"": profile}
    tabs = {}
    for chunk in m.group(1).split("|-|"):
        label, _, body = chunk.partition("=")
        tabs[label.strip()] = body
    return tabs


def expand(profile: str) -> str:
    """Render the wiki's templates to plain wikitext so season names and
    tribe labels come through as text. The tribe highlight template renders
    to a styled link that loses the tribe name, so it is rewritten first."""
    profile = re.sub(
        r"\{\{tribehl\d*\|[^|}]*\|([^|}]+)\|([^|}]+)\}\}", r"\1, \2", profile
    )
    r = httpx.post(
        WIKI_API,
        data={
            "action": "expandtemplates",
            "text": profile,
            "prop": "wikitext",
            "format": "json",
        },
        headers=UA,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["expandtemplates"]["wikitext"]


def parse_profile(profile: str) -> list[dict]:
    """The Q&A pairs from one season's profile text, in order.

    Lines look like `'''Question?:''' answer <br />`; the colon sometimes sits
    inside the bold and sometimes after it.
    """
    pairs = []
    for m in re.finditer(
        r"'''(.+?):?\s*'''\s*:?\s*(.*?)(?=<br\s*/?>|\n'''|\Z)", profile, re.S
    ):
        question = _clean(m.group(1)).rstrip(":").strip()
        answer = _clean(m.group(2))
        if question.lower() in NOT_QUESTIONS or not answer:
            continue
        pairs.append({"question": question, "answer": answer})
    return pairs


def wikitext(title: str) -> str | None:
    r = httpx.get(
        WIKI_API,
        params={
            "action": "parse",
            "page": title,
            "prop": "wikitext",
            "redirects": 1,
            "format": "json",
        },
        headers=UA,
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    return data["parse"]["wikitext"]["*"] if "parse" in data else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("survivor_season", type=int, help="US season number, e.g. 51")
    parser.add_argument("--our-season", type=int, required=True)
    parser.add_argument(
        "--replace", action="store_true", help="also refresh contestants already set"
    )
    parser.add_argument(
        "--skip",
        action="append",
        default=[],
        metavar="TEXT",
        help="drop questions containing TEXT (case-insensitive; repeatable)",
    )
    parser.add_argument(
        "--tab",
        help="wiki profile tab to read for multi-season castaways; defaults to"
        " the one whose label appears in our season's name",
    )
    parser.add_argument(
        "--apply", action="store_true", help="write the values (default: dry run)"
    )
    parser.add_argument(
        "--api", default=os.environ.get("API_URL", "http://127.0.0.1:8000")
    )
    args = parser.parse_args()
    load_dotenv()

    login = httpx.post(
        f"{os.environ['SUPABASE_URL']}/auth/v1/token?grant_type=password",
        headers={"apikey": os.environ["SUPABASE_ANON_KEY"]},
        json={
            "email": os.environ["PRODUCER_EMAIL"],
            "password": os.environ["PRODUCER_PASSWORD"],
        },
    )
    login.raise_for_status()
    api = httpx.Client(
        base_url=args.api,
        timeout=30,
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )

    seasons = api.get("/seasons").raise_for_status().json()
    season = next((s for s in seasons if s["season_number"] == args.our_season), None)
    if not season:
        sys.exit(f"No league season with season_number={args.our_season}")
    cast = api.get(f"/seasons/{season['id']}/contestants").raise_for_status().json()

    skips = [s.lower() for s in args.skip]
    missing, written = [], 0
    for c in cast:
        if c.get("bio_qa") and not args.replace:
            print(f"  {c['name']:<24} already set, skipping")
            continue
        # The wiki files a castaway under the name the show used ("Jelly
        # Loblack"), so try nickname + surname when the full name misses.
        titles = [c["name"]]
        if c.get("nickname"):
            titles.append(f"{c['nickname']} {c['name'].split()[-1]}")
        text = next((t for t in (wikitext(x) for x in titles) if t), None)
        tabs = profile_tabs(text) if text else {}
        if "" in tabs:
            profile = tabs[""]
        else:
            tab = args.tab or next((t for t in tabs if t and t in season["name"]), None)
            if tab not in tabs:
                sys.exit(
                    f"{c['name']}: no profile tab matches {season['name']!r};"
                    f" pass --tab, one of {sorted(tabs)}"
                )
            profile = tabs[tab]
        pairs = parse_profile(expand(profile)) if profile.strip() else []
        pairs = [p for p in pairs if not any(s in p["question"].lower() for s in skips)]
        if not pairs:
            missing.append(c["name"])
            print(f"  {c['name']:<24} NO Q&A FOUND")
            continue
        chars = sum(len(p["answer"]) for p in pairs)
        if args.apply:
            api.patch(
                f"/contestants/{c['id']}", json={"bio_qa": pairs}
            ).raise_for_status()
            written += 1
        print(f"  {c['name']:<24} {len(pairs)} questions, {chars} chars")

    if not args.apply:
        print("\ndry run — re-run with --apply to write")
    print(f"done: {len(cast) - len(missing)}/{len(cast)} matched, {written} written")
    if missing:
        print("missing:", ", ".join(missing))


if __name__ == "__main__":
    main()
