"""Load contestant headshots into Supabase storage and set each contestant's
image_url (run before episode 1, or with --replace to fix a loaded season).

Source is TVmaze person portraits (#187 — true headshots, tight face crops;
CC BY-SA), falling back to the Survivor fandom wiki's season cast photo when
TVmaze has no match. League names may be nicknames (#188), so full names for
searching are resolved from survivoR's castaways data.

Dry-runs by default so the person matches can be eyeballed; pass --apply to
upload and set URLs.

Usage (from backend/):
    uv run python scripts/load_headshots.py 50 --our-season 50 [--replace] [--apply]

Env: SUPABASE_URL, SUPABASE_ANON_KEY, PRODUCER_EMAIL/PASSWORD (as
scripts/import_episode.py), plus SUPABASE_SERVICE_ROLE_KEY for the bucket
upload (get it from the dashboard or `supabase projects api-keys`).
"""

import argparse
import os
import re
import sys
import time

import httpx
from dotenv import load_dotenv

WIKI_API = "https://survivor.fandom.com/api.php"
TVMAZE_API = "https://api.tvmaze.com"
SURVIVOR_CASTAWAYS = (
    "https://raw.githubusercontent.com/doehm/survivoR/master/dev/json/castaways.json"
)
UA = {"User-Agent": "tribal-knowledge/1.0 (private fantasy league)"}
BUCKET = "contestant-photos"


def full_names(season: int) -> dict[str, str]:
    """lowercased short/full name → survivoR full_name, for TVmaze search."""
    rows = httpx.get(SURVIVOR_CASTAWAYS, headers=UA, timeout=60).json()
    out: dict[str, str] = {}
    for r in rows:
        if r["version_season"] == f"US{season}":
            out[r["castaway"].lower()] = r["full_name"]
            out[r["full_name"].lower()] = r["full_name"]
    return out


def _norm(name: str) -> str:
    """Casefolded, punctuation-free name for comparison."""
    return re.sub(r"[^a-z]", "", name.lower())


def tvmaze_person(query: str) -> tuple[str, str] | None:
    """(person name, portrait url) of the TVmaze match with an image whose
    name actually matches the query.

    TVmaze search is fuzzy and returns near-misses first, so taking the top
    hit put Elizabeth Olsen, Kary Osmond and Nick Wilton on the DvG cast
    (2026-08-04). A credit check can't disambiguate — TVmaze holds portraits
    for reality contestants with no cast credits at all — so the name has to
    match exactly, and anything else falls through to the wiki cast photo,
    which is right by construction.
    """
    r = httpx.get(
        f"{TVMAZE_API}/search/people", params={"q": query}, headers=UA, timeout=30
    )
    r.raise_for_status()
    for hit in r.json():
        person = hit["person"]
        if person.get("image") and _norm(person["name"]) == _norm(query):
            # full-res original: face detection needs the pixels
            return person["name"], person["image"]["original"]
    return None


def pick_face(faces, image_height: int):
    """The detection that is actually the head, or None if there isn't one.

    Two ways Haar gets this wrong on Survivor promo art, pulling against each
    other. A full-body shot yields torso false positives that can out-measure
    the real face by a few pixels, so pure largest-area cropped Natalia and Pat
    to a midriff. A close-up yields small background faces, so pure topmost
    would crop Mike White to a bystander. Discard anything below the top of the
    frame, keep only detections comparable in size to the biggest, then take
    the highest of those — the head sits above the body in both cases.
    """
    faces = [f for f in faces if f[1] + f[3] / 2 < image_height * 0.55]
    if not len(faces):
        return None
    biggest = max(f[2] for f in faces)
    return min((f for f in faces if f[2] >= biggest * 0.6), key=lambda f: f[1])


def face_crop(img_bytes: bytes) -> bytes:
    """Square crop around the detected face, resized to ~400px (#187).

    TVmaze/wiki framing is inconsistent (headshots mixed with full-body promo
    shots); Haar detection + a generous margin normalizes both. No face found →
    the image passes through untouched.
    """
    import cv2
    import numpy as np

    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        return img_bytes
    faces = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    ).detectMultiScale(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 1.1, 6)
    ih, iw = img.shape[:2]
    face = pick_face(faces, ih)
    crop = img
    if face is not None:
        x, y, w, h = face
        # face plus hair and shoulders, biased slightly upward
        size = min(int(h * 2.6), ih, iw)
        cx, cy = x + w // 2, y + h // 2 - int(h * 0.15)
        x0 = max(0, min(cx - size // 2, iw - size))
        y0 = max(0, min(cy - size // 2, ih - size))
        crop = img[y0 : y0 + size, x0 : x0 + size]
    if crop.shape[0] > 400:
        crop = cv2.resize(crop, (round(400 * crop.shape[1] / crop.shape[0]), 400))
    ok, out = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return out.tobytes() if ok else img_bytes


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
            # a face crop is a fraction of the frame, so fetch well above the
            # 400px target — face_crop resizes back down
            "iiurlwidth": 1200,
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
    parser.add_argument("survivor_season", type=int, help="US season number, e.g. 50")
    parser.add_argument("--our-season", type=int, required=True)
    parser.add_argument(
        "--replace", action="store_true", help="also refresh contestants with a photo"
    )
    parser.add_argument(
        "--apply", action="store_true", help="upload and set URLs (default: dry run)"
    )
    parser.add_argument(
        "--api", default=os.environ.get("API_URL", "http://127.0.0.1:8000")
    )
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        metavar="NAME",
        help="restrict the run to these contestants, for redoing one bad crop"
        " without touching the rest of the cast (repeatable)",
    )
    parser.add_argument(
        "--wiki",
        action="append",
        default=[],
        metavar="NAME",
        help="force the wiki cast photo for this contestant, for exact-name"
        " collisions with a more famous person (repeatable)",
    )
    args = parser.parse_args()
    load_dotenv()

    supabase_url = os.environ["SUPABASE_URL"]
    # Only uploads need the service key — dry runs work without it
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if args.apply and not service_key:
        sys.exit("--apply needs SUPABASE_SERVICE_ROLE_KEY in the env")

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
    season = next((s for s in seasons if s["season_number"] == args.our_season), None)
    if not season:
        sys.exit(f"No league season with season_number={args.our_season}")
    cast = api.get(f"/seasons/{season['id']}/contestants").raise_for_status().json()

    storage = (
        httpx.Client(
            base_url=f"{supabase_url}/storage/v1",
            timeout=60,
            headers={"Authorization": f"Bearer {service_key}", "apikey": service_key},
        )
        if args.apply
        else None
    )

    names = full_names(args.survivor_season)
    run_stamp = int(time.time())
    missing = []
    if args.only:
        cast = [c for c in cast if any(_norm(o) == _norm(c["name"]) for o in args.only)]
    for c in cast:
        if c.get("image_url") and not args.replace:
            print(f"  {c['name']:<24} already set, skipping")
            continue
        full = names.get(c["name"].lower(), c["name"])
        forced_wiki = any(_norm(w) == _norm(c["name"]) for w in args.wiki)
        match = None if forced_wiki else tvmaze_person(full)
        if match:
            person, src = match
            label = f"TVmaze: {person}"
        else:
            src = wiki_file_url(args.survivor_season, full)
            label = "wiki fallback"
            # The wiki files a castaway under the name the show used ("Kass
            # McQuillen", not "Kassandra McQuillen"): try nickname + surname.
            if not src and c.get("nickname"):
                short = f"{c['nickname']} {full.split()[-1]}"
                src = wiki_file_url(args.survivor_season, short)
                label = f"wiki fallback ({short})"
        if not src:
            missing.append(c["name"])
            print(f"  {c['name']:<24} NO PHOTO FOUND — upload manually")
            continue
        if not args.apply:
            print(f"  {c['name']:<24} → {label}")
            continue
        img = httpx.get(src, headers=UA, timeout=60, follow_redirects=True)
        img.raise_for_status()
        content = face_crop(img.content)
        slug = re.sub(r"[^a-z0-9]+", "-", c["name"].lower()).strip("-")
        path = f"s{args.survivor_season}/{slug}.jpg"
        up = storage.post(
            f"/object/{BUCKET}/{path}",
            content=content,
            headers={"Content-Type": "image/jpeg", "x-upsert": "true"},
        )
        up.raise_for_status()
        # ?v= busts browser/CDN caches when an existing photo is replaced
        public_url = (
            f"{supabase_url}/storage/v1/object/public/{BUCKET}/{path}?v={run_stamp}"
        )
        api.patch(
            f"/contestants/{c['id']}", json={"image_url": public_url}
        ).raise_for_status()
        print(f"  {c['name']:<24} ok — {label} ({len(content) // 1024} KB)")

    if not args.apply:
        print("\ndry run — re-run with --apply to upload")
    print(
        f"done: {len(cast) - len(missing)}/{len(cast)}"
        + (f"; missing: {', '.join(missing)}" if missing else "")
    )


if __name__ == "__main__":
    main()
