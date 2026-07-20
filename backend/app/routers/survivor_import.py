"""Review-gated survivoR import proposal for the admin UI (issue #132).

Serves the same proposal the CLI (scripts/import_episode.py) prints: survivoR's
published JSON mapped to our eliminations / scoring events / placements, with
judgment calls surfaced as warnings and unmatched names reported loudly instead
of guessed. Read-only — the admin reviews in the UI and applies through the
existing additive endpoints.

Data: https://github.com/doehm/survivoR (CC BY).
"""

import json
import time
import urllib.request
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin
from app.schemas import ImportProposal
from app.survivor_import import build_proposal

router = APIRouter(tags=["survivor-import"])

_RAW = "https://raw.githubusercontent.com/doehm/survivoR/master/dev/json"
_FILES = [
    "vote_history",
    "boot_order",
    "challenge_results",
    "advantage_movement",
    "advantage_details",
    "castaways",
]
_TTL_SECONDS = 3600

# name → (fetched_at, rows). Files cover all seasons and change ~daily during
# an airing season, so an hour of staleness is fine for admin scoring night.
_cache: dict[str, tuple[float, list[dict]]] = {}


def _fetch_survivor_data(refresh: bool) -> dict[str, list[dict]]:
    data = {}
    for name in _FILES:
        cached = _cache.get(name)
        if not refresh and cached and time.time() - cached[0] < _TTL_SECONDS:
            data[name] = cached[1]
            continue
        try:
            with urllib.request.urlopen(f"{_RAW}/{name}.json", timeout=30) as resp:
                rows = json.load(resp)
        except Exception as exc:
            raise HTTPException(
                status_code=502, detail=f"survivoR fetch failed ({name}.json): {exc}"
            )
        _cache[name] = (time.time(), rows)
        data[name] = rows
    return data


@router.get(
    "/episodes/{episode_id}/import-proposal",
    response_model=ImportProposal,
)
def get_import_proposal(
    episode_id: UUID,
    source_season: int | None = None,
    refresh: bool = False,
    _: UUID = Depends(get_current_admin),
):
    """Build the proposed import for one episode.

    source_season is the US season number; defaults to the league season's
    own season_number (practice seasons replaying an old season override it).
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                select e.episode_number, s.season_number, s.id as season_id
                from episodes e join seasons s on s.id = e.season_id
                where e.id = %s
                """,
                [str(episode_id)],
            )
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")
            cur.execute(
                "select id, name from contestants where season_id = %s",
                [str(episode["season_id"])],
            )
            cast = cur.fetchall()

    season_key = f"US{source_season or episode['season_number']}"
    data = _fetch_survivor_data(refresh)

    castaway_rows = [r for r in data["castaways"] if r["version_season"] == season_key]
    if not castaway_rows:
        raise HTTPException(
            status_code=404, detail=f"No survivoR data for season {season_key}"
        )

    proposal = build_proposal(
        season_key,
        episode["episode_number"],
        vote_history=data["vote_history"],
        boot_order=data["boot_order"],
        challenge_results=data["challenge_results"],
        advantage_movement=data["advantage_movement"],
        advantage_details=data["advantage_details"],
        castaways=data["castaways"],
    )

    # castaway_id → contestant UUID by name, short OR full (as the CLI).
    # Items whose castaway has no league contestant are dropped from the
    # proposal and their names reported in `unmatched` — never guessed.
    by_name = {c["name"].lower(): str(c["id"]) for c in cast}
    names = {r["castaway_id"]: (r["castaway"], r["full_name"]) for r in castaway_rows}
    id_map: dict[str, str] = {}
    unmatched: set[str] = set()

    def resolve(castaway_id: str) -> str | None:
        if castaway_id in id_map:
            return id_map[castaway_id]
        short, full = names.get(castaway_id, ("?", "?"))
        our_id = by_name.get(short.lower()) or by_name.get(full.lower())
        if our_id:
            id_map[castaway_id] = our_id
        else:
            unmatched.add(f"{short} / {full}")
        return our_id

    def mapped(rows: list[dict], fields: list[str]) -> list[dict]:
        out = []
        for r in rows:
            cid = resolve(r["castaway_id"])
            if cid:
                out.append({"contestant_id": cid, **{f: r[f] for f in fields}})
        return out

    return {
        "eliminations": mapped(
            proposal["eliminations"], ["name", "elimination_type", "result"]
        ),
        "events": mapped(proposal["events"], ["name", "event_type", "quantity"]),
        "placements": mapped(proposal["placements"], ["name", "placement"]),
        "warnings": proposal["warnings"],
        "unmatched": sorted(unmatched),
        "source": f"{season_key} episode {episode['episode_number']}",
    }
