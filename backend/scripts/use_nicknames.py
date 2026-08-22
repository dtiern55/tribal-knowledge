"""Set a season's contestant nicknames from their survivoR short names (#188).

Fans know castaways by the name the show uses — Coach, Ozzy. The short
`castaway` name goes in the `nickname` column (the full legal name stays in
`name`); display reads coalesce(nickname, name). Matches each contestant by
short OR full name, then sets nickname where it differs from the full name.

Usage (from backend/):
    uv run python scripts/use_nicknames.py 50 --our-season 50          # dry run
    uv run python scripts/use_nicknames.py 50 --our-season 50 --apply

Env: same as scripts/import_episode.py.
"""

import argparse
import os
import sys

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

    nicknames, unmatched = [], []
    for c in cast:
        short = by_name.get(c["name"].lower())
        if short is None:
            unmatched.append(c["name"])
        elif short != c["name"] and short != c.get("nickname"):
            nicknames.append((c, short))

    for c, short in nicknames:
        print(f"  {c['name']:<28} → {short}")
    for name in unmatched:
        print(f"  {name:<28} ! no survivoR match, skipping")
    if not nicknames:
        print("Nothing to update.")
        return
    if not args.apply:
        print("\nDry run — rerun with --apply to set nicknames.")
        return

    for c, short in nicknames:
        client.patch(
            f"/contestants/{c['id']}", json={"nickname": short}
        ).raise_for_status()
    print(f"Set {len(nicknames)} nicknames.")


if __name__ == "__main__":
    main()
