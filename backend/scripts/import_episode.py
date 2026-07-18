"""Import one episode's eliminations + scoring events from survivoR (issue #132).

Usage (from backend/):
    uv run python scripts/import_episode.py 47 5 --our-season 99          # dry run
    uv run python scripts/import_episode.py 47 5 --our-season 99 --apply  # post it

Dry run prints the proposal and exits. --apply asks for confirmation, then
posts through the normal admin API (real producer login, real JWT). Fine-grained
fixes afterwards happen in the admin UI — scoring events are additive with
per-item delete.

Data: https://github.com/doehm/survivoR (CC BY) — cached in ~/.cache/survivoR.
"""

import argparse
import json
import os
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.survivor_import import build_proposal  # noqa: E402

RAW = "https://raw.githubusercontent.com/doehm/survivoR/master/dev/json"
FILES = [
    "vote_history",
    "boot_order",
    "challenge_results",
    "advantage_movement",
    "advantage_details",
    "castaways",
]
CACHE = Path.home() / ".cache" / "survivoR"


def fetch(refresh: bool) -> dict[str, list[dict]]:
    CACHE.mkdir(parents=True, exist_ok=True)
    data = {}
    for name in FILES:
        path = CACHE / f"{name}.json"
        if refresh or not path.exists():
            print(f"fetching {name}.json ...")
            urllib.request.urlretrieve(f"{RAW}/{name}.json", path)
        data[name] = json.loads(path.read_text())
    return data


def login(api: httpx.Client) -> str:
    supabase_url = os.environ["SUPABASE_URL"]
    anon_key = os.environ["SUPABASE_ANON_KEY"]
    resp = httpx.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
        headers={"apikey": anon_key},
        json={
            "email": os.environ["PRODUCER_EMAIL"],
            "password": os.environ["PRODUCER_PASSWORD"],
        },
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("survivor_season", type=int, help="US season number, e.g. 47")
    parser.add_argument("episode", type=int)
    parser.add_argument(
        "--our-season",
        type=int,
        required=True,
        help="season_number of the league season to import into",
    )
    parser.add_argument(
        "--api", default=os.environ.get("API_URL", "http://127.0.0.1:8000")
    )
    parser.add_argument("--apply", action="store_true", help="post after confirmation")
    parser.add_argument(
        "--refresh", action="store_true", help="re-download survivoR data"
    )
    args = parser.parse_args()

    load_dotenv()
    season_key = f"US{args.survivor_season}"
    data = fetch(args.refresh)

    proposal = build_proposal(
        season_key,
        args.episode,
        vote_history=data["vote_history"],
        boot_order=data["boot_order"],
        challenge_results=data["challenge_results"],
        advantage_movement=data["advantage_movement"],
        advantage_details=data["advantage_details"],
        castaways=data["castaways"],
    )

    token = None
    client = httpx.Client(base_url=args.api, timeout=30)
    token = login(client)
    client.headers["Authorization"] = f"Bearer {token}"

    seasons = client.get("/seasons").raise_for_status().json()
    season = next((s for s in seasons if s["season_number"] == args.our_season), None)
    if not season:
        sys.exit(f"No league season with season_number={args.our_season}")
    episodes = client.get(f"/seasons/{season['id']}/episodes").raise_for_status().json()
    ep = next((e for e in episodes if e["episode_number"] == args.episode), None)
    if not ep:
        sys.exit(
            f"Episode {args.episode} doesn't exist in season {args.our_season} — "
            "create it in the admin UI first"
        )
    cast = client.get(f"/seasons/{season['id']}/contestants").raise_for_status().json()

    # survivoR castaway_id → our contestant UUID, by name. Loud on misses.
    by_name = {c["name"].lower(): c["id"] for c in cast}
    castaway_names = {
        r["castaway_id"]: (r["castaway"], r["full_name"])
        for r in data["castaways"]
        if r["version_season"] == season_key
    }
    id_map: dict[str, str] = {}
    referenced = {
        p["castaway_id"]
        for p in proposal["eliminations"] + proposal["events"] + proposal["placements"]
    }
    unmatched = []
    for cid in referenced:
        short, full = castaway_names.get(cid, ("?", "?"))
        our_id = by_name.get(short.lower()) or by_name.get(full.lower())
        if our_id:
            id_map[cid] = our_id
        else:
            unmatched.append(f"  {short} / {full} ({cid})")
    if unmatched:
        sys.exit(
            "survivoR names with no matching contestant:\n"
            + "\n".join(sorted(unmatched))
            + "\nLeague cast: "
            + ", ".join(sorted(c["name"] for c in cast))
        )

    # --- print the proposal ---
    print(
        f"\n=== {season_key} episode {args.episode} → "
        f"league season {args.our_season} episode {args.episode} ===\n"
    )
    if proposal["eliminations"]:
        print("Eliminations:")
        for e in proposal["eliminations"]:
            print(f"  {e['name']:<20} {e['elimination_type']}  ({e['result']})")
    per_person: dict[str, list] = defaultdict(list)
    for ev in proposal["events"]:
        per_person[ev["name"]].append(ev)
    print("\nScoring events:")
    for name in sorted(per_person):
        parts = [
            ev["event_type"] + (f" x{ev['quantity']}" if ev["quantity"] > 1 else "")
            for ev in per_person[name]
        ]
        print(f"  {name:<20} {', '.join(parts)}")
    if proposal["placements"]:
        print("\nPlacements:")
        for p in proposal["placements"]:
            print(f"  {p['name']:<20} {p['placement']}")
    print("\nReview flags:")
    for w in proposal["warnings"]:
        print(f"  ! {w}")

    if not args.apply:
        print("\nDry run — rerun with --apply to post.")
        return

    if input("\nPost this to the API? [y/N] ").strip().lower() != "y":
        print("Aborted.")
        return

    note = f"import: {season_key} e{args.episode}"
    if proposal["eliminations"]:
        client.post(
            f"/episodes/{ep['id']}/eliminations",
            json=[
                {
                    "contestant_id": id_map[e["castaway_id"]],
                    "elimination_type": e["elimination_type"],
                }
                for e in proposal["eliminations"]
            ],
        ).raise_for_status()
        print(f"posted {len(proposal['eliminations'])} eliminations")
    if proposal["events"]:
        client.post(
            f"/episodes/{ep['id']}/scoring-events",
            json=[
                {
                    "contestant_id": id_map[ev["castaway_id"]],
                    "event_type": ev["event_type"],
                    "quantity": ev["quantity"],
                    "notes": note,
                }
                for ev in proposal["events"]
            ],
        ).raise_for_status()
        print(f"posted {len(proposal['events'])} scoring events")
    for p in proposal["placements"]:
        client.patch(
            f"/contestants/{id_map[p['castaway_id']]}",
            json={"placement": p["placement"]},
        ).raise_for_status()
    if proposal["placements"]:
        print(f"set {len(proposal['placements'])} placements")
    print("Done. Review in the admin UI; adjust judgment calls there.")


if __name__ == "__main__":
    main()
