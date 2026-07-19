"""Load contestant headshots from the Survivor fandom wiki into Supabase
storage and set each contestant's image_url (run before episode 1).

Usage (from backend/):
    uv run python scripts/load_headshots.py 49 --our-season 49

Env: SUPABASE_URL, SUPABASE_ANON_KEY, PRODUCER_EMAIL/PASSWORD (as
scripts/import_episode.py), plus SUPABASE_SERVICE_ROLE_KEY for the bucket
upload (get it from the dashboard or `supabase projects api-keys`).

Images are the wiki's season-specific cast photos (File:S<n>_First_Last.jpg);
anything missing is reported for manual upload via Studio.
"""

import argparse
import os
import re
import sys

import httpx
from dotenv import load_dotenv

WIKI_API = "https://survivor.fandom.com/api.php"
UA = {"User-Agent": "tribal-knowledge/1.0 (private fantasy league)"}
BUCKET = "contestant-photos"


def wiki_file_url(season: int, full_name: str) -> str | None:
    """URL of the wiki's season-specific cast photo, or None if absent."""
    filename = f"File:S{season}_{full_name.replace(' ', '_')}.jpg"
    r = httpx.get(
        WIKI_API,
        params={
            "action": "query",
            "titles": filename,
            "prop": "imageinfo",
            "iiprop": "url",
            "iiurlwidth": 400,
            "format": "json",
        },
        headers=UA,
        timeout=30,
    )
    r.raise_for_status()
    pages = r.json()["query"]["pages"]
    page = next(iter(pages.values()))
    info = page.get("imageinfo")
    return info[0]["thumburl"] if info else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("survivor_season", type=int, help="US season number, e.g. 49")
    parser.add_argument("--our-season", type=int, required=True)
    parser.add_argument(
        "--api", default=os.environ.get("API_URL", "http://127.0.0.1:8000")
    )
    args = parser.parse_args()
    load_dotenv()

    supabase_url = os.environ["SUPABASE_URL"]
    service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

    login = httpx.post(
        f"{supabase_url}/auth/v1/token?grant_type=password",
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
    season = next(
        (s for s in seasons if s["season_number"] == args.our_season), None
    )
    if not season:
        sys.exit(f"No league season with season_number={args.our_season}")
    cast = (
        api.get(f"/seasons/{season['id']}/contestants").raise_for_status().json()
    )

    storage = httpx.Client(
        base_url=f"{supabase_url}/storage/v1",
        timeout=60,
        headers={"Authorization": f"Bearer {service_key}", "apikey": service_key},
    )

    missing = []
    for c in cast:
        if c.get("image_url"):
            print(f"  {c['name']:<24} already set, skipping")
            continue
        src = wiki_file_url(args.survivor_season, c["name"])
        if not src:
            missing.append(c["name"])
            print(f"  {c['name']:<24} NO WIKI PHOTO — upload manually")
            continue
        img = httpx.get(src, headers=UA, timeout=60)
        img.raise_for_status()
        slug = re.sub(r"[^a-z0-9]+", "-", c["name"].lower()).strip("-")
        path = f"s{args.survivor_season}/{slug}.jpg"
        up = storage.post(
            f"/object/{BUCKET}/{path}",
            content=img.content,
            headers={"Content-Type": "image/jpeg", "x-upsert": "true"},
        )
        up.raise_for_status()
        public_url = f"{supabase_url}/storage/v1/object/public/{BUCKET}/{path}"
        api.patch(
            f"/contestants/{c['id']}", json={"image_url": public_url}
        ).raise_for_status()
        print(f"  {c['name']:<24} ok ({len(img.content) // 1024} KB)")

    print(
        f"\ndone: {len(cast) - len(missing)}/{len(cast)} set"
        + (f"; missing: {', '.join(missing)}" if missing else "")
    )


if __name__ == "__main__":
    main()
