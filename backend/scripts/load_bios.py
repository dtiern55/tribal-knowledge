"""Load cast bio details — age, occupation, hometown — from survivoR (#262).

survivoR splits these across two files: `castaways` carries age and the
city/state hometown, `castaway_details` carries occupation. League names may be
nicknames (#188), so rows are matched on the survivoR full name the same way
scripts/load_headshots.py resolves photos.

The prose blurb is not imported. survivoR has no bio text and TVmaze returns a
summary for none of the DvG cast, so `bio` stays hand-written — set it in the
admin UI or with a PATCH.

Dry-runs by default so the matches can be eyeballed; pass --apply to write.

Usage (from backend/):
    uv run python scripts/load_bios.py 37 --our-season 37 [--replace] [--apply]

Env: SUPABASE_URL, SUPABASE_ANON_KEY, PRODUCER_EMAIL/PASSWORD (as
scripts/import_episode.py).
"""

import argparse
import os
import sys

import httpx
from dotenv import load_dotenv

SURVIVOR_JSON = "https://raw.githubusercontent.com/doehm/survivoR/master/dev/json"
UA = {"User-Agent": "tribal-knowledge/1.0 (private fantasy league)"}
FIELDS = ("age", "occupation", "hometown")


def merge_bios(
    castaways: list[dict], details: list[dict], season: int
) -> dict[str, dict]:
    """lowercased survivoR short/full name → {age, occupation, hometown}."""
    occupations = {
        r["castaway_id"]: r.get("occupation") for r in details if r.get("castaway_id")
    }

    out: dict[str, dict] = {}
    for r in castaways:
        if r["version_season"] != f"US{season}":
            continue
        city, state = r.get("city"), r.get("state")
        occupation = occupations.get(r["castaway_id"])
        bio = {
            "age": r.get("age"),
            # survivoR packs multiple jobs into one field ("Public
            # Defender;Attorney") — read the first as the headline one
            "occupation": occupation.split(";")[0].strip() if occupation else None,
            "hometown": ", ".join(p for p in (city, state) if p) or None,
        }
        out[r["castaway"].lower()] = bio
        out[r["full_name"].lower()] = bio
    return out


def survivor_bios(season: int) -> dict[str, dict]:
    """merge_bios over the two live survivoR files."""
    castaways = httpx.get(f"{SURVIVOR_JSON}/castaways.json", headers=UA, timeout=60)
    details = httpx.get(
        f"{SURVIVOR_JSON}/castaway_details.json", headers=UA, timeout=120
    )
    return merge_bios(
        castaways.raise_for_status().json(),
        details.raise_for_status().json(),
        season,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("survivor_season", type=int, help="US season number, e.g. 37")
    parser.add_argument("--our-season", type=int, required=True)
    parser.add_argument(
        "--replace", action="store_true", help="also refresh contestants already set"
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

    bios = survivor_bios(args.survivor_season)
    if not bios:
        sys.exit(f"No survivoR castaways for US{args.survivor_season}")

    unmatched, written = [], 0
    for c in cast:
        if any(c.get(f) for f in FIELDS) and not args.replace:
            print(f"  {c['name']:<24} already set, skipping")
            continue
        bio = bios.get(c["name"].lower())
        if not bio:
            unmatched.append(c["name"])
            print(f"  {c['name']:<24} NO survivoR MATCH")
            continue
        # Never blank a value that is already there just because survivoR
        # has a hole in this season's data
        update = {k: v for k, v in bio.items() if v is not None}
        summary = ", ".join(f"{k}={update[k]}" for k in FIELDS if k in update)
        if not args.apply:
            print(f"  {c['name']:<24} → {summary or 'nothing to set'}")
            continue
        if update:
            api.patch(f"/contestants/{c['id']}", json=update).raise_for_status()
            written += 1
        print(f"  {c['name']:<24} ok — {summary or 'nothing to set'}")

    if not args.apply:
        print("\ndry run — re-run with --apply to write")
    print(
        f"done: {len(cast) - len(unmatched)}/{len(cast)} matched"
        + (f", {written} written" if args.apply else "")
        + (f"; unmatched: {', '.join(unmatched)}" if unmatched else "")
    )


if __name__ == "__main__":
    main()
