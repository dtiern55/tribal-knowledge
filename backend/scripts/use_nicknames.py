"""Rename a season's contestants to their survivoR short names (#188).

Fans know castaways by the name the show uses — Coach, Ozzy — and the fandom
wiki names photo files the same way, so the short `castaway` name is the right
display name. Matches each contestant by short OR full name, then renames.

Usage (from backend/):
    uv run python scripts/use_nicknames.py 50 --our-season 50          # dry run
    uv run python scripts/use_nicknames.py 50 --our-season 50 --apply

Env: same as scripts/import_episode.py.
"""

import argparse
import os
import sys
from collections import Counter

import httpx
from dotenv import load_dotenv
from import_episode import fetch, login


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("survivor_season", type=int, help="US season number, e.g. 50")
    parser.add_argument("--our-season", type=int, required=True)
    parser.add_argument(
        "--api", default=os.environ.get("API_URL", "http://127.0.0.1:8000")
    )
    parser.add_argument("--apply", action="store_true", help="patch after dry run")
    parser.add_argument(
        "--refresh", action="store_true", help="re-download survivoR data"
    )
    args = parser.parse_args()
    load_dotenv()

    season_key = f"US{args.survivor_season}"
    castaways = [
        r for r in fetch(args.refresh)["castaways"] if r["version_season"] == season_key
    ]
    if not castaways:
        sys.exit(f"No survivoR castaways for {season_key}")

    client = httpx.Client(base_url=args.api, timeout=30)
    client.headers["Authorization"] = f"Bearer {login(client)}"
    seasons = client.get("/seasons").raise_for_status().json()
    season = next((s for s in seasons if s["season_number"] == args.our_season), None)
    if not season:
        sys.exit(f"No league season with season_number={args.our_season}")
    cast = client.get(f"/seasons/{season['id']}/contestants").raise_for_status().json()

    by_name = {}
    for r in castaways:
        by_name[r["castaway"].lower()] = r["castaway"]
        by_name[r["full_name"].lower()] = r["castaway"]

    renames, unmatched = [], []
    for c in cast:
        short = by_name.get(c["name"].lower())
        if short is None:
            unmatched.append(c["name"])
        elif short != c["name"]:
            renames.append((c, short))

    # Two castaways sharing a short name (e.g. two Rachels) would collide,
    # with each other or with an untouched contestant — leave those alone
    # rather than guess a disambiguation.
    renamed_ids = {c["id"] for c, _ in renames}
    counts = Counter(
        [s.lower() for _, s in renames]
        + [c["name"].lower() for c in cast if c["id"] not in renamed_ids]
    )
    collisions = [(c, s) for c, s in renames if counts[s.lower()] > 1]
    renames = [(c, s) for c, s in renames if counts[s.lower()] == 1]

    for c, short in renames:
        print(f"  {c['name']:<28} → {short}")
    for name in unmatched:
        print(f"  {name:<28} ! no survivoR match, skipping")
    for c, short in collisions:
        print(f"  {c['name']:<28} ! short name '{short}' not unique, skipping")
    if not renames:
        print("Nothing to rename.")
        return
    if not args.apply:
        print("\nDry run — rerun with --apply to rename.")
        return

    for c, short in renames:
        client.patch(f"/contestants/{c['id']}", json={"name": short}).raise_for_status()
    print(f"Renamed {len(renames)} contestants.")


if __name__ == "__main__":
    main()
