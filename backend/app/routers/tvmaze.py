"""Review-gated TVmaze episode proposal for the admin UI (issue #197).

Proposes a season's episodes from TVmaze's schedule — real air dates and
airstamps, with picks_lock_at defaulting to the airstamp — so scoring night
doesn't start with hand-typed episode rows. Read-only: the admin reviews in
the UI and creates through the existing POST /seasons/{id}/episodes.

Data: https://www.tvmaze.com (CC BY-SA — linked in the admin UI).
"""

import json
import time
import urllib.request
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin
from app.schemas import EpisodeProposal

router = APIRouter(tags=["tvmaze"])

_API = "https://api.tvmaze.com"
_SURVIVOR_SHOW_ID = 114  # Survivor (US)
_TTL_SECONDS = 3600

# url → (fetched_at, payload). Schedules shift rarely; an hour of staleness
# is fine for an admin setup task (same policy as the survivoR cache).
_cache: dict[str, tuple[float, list[dict]]] = {}


def _fetch(path: str, refresh: bool) -> list[dict]:
    url = f"{_API}{path}"
    cached = _cache.get(url)
    if not refresh and cached and time.time() - cached[0] < _TTL_SECONDS:
        return cached[1]
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            payload = json.load(resp)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TVmaze fetch failed: {exc}")
    _cache[url] = (time.time(), payload)
    return payload


def build_episode_proposal(
    tvmaze_episodes: list[dict], existing_numbers: set[int]
) -> list[dict]:
    """Map TVmaze episode rows to proposed league episodes.

    picks_lock_at defaults to the airstamp; the last episode is flagged as
    the finale (admin unchecks if the season isn't fully scheduled yet).
    """
    episodes = sorted(tvmaze_episodes, key=lambda e: e["number"])
    return [
        {
            "episode_number": e["number"],
            "name": e.get("name") or "",
            "air_date": e["airdate"],
            "picks_lock_at": e["airstamp"],
            "is_finale": e is episodes[-1],
            "exists": e["number"] in existing_numbers,
        }
        for e in episodes
    ]


@router.get("/seasons/{season_id}/episode-proposal", response_model=EpisodeProposal)
def get_episode_proposal(
    season_id: UUID,
    tvmaze_season: int | None = None,
    refresh: bool = False,
    _: UUID = Depends(get_current_admin),
):
    """Propose the season's episodes from TVmaze.

    tvmaze_season is the US season number; defaults to the league season's
    own season_number (practice seasons replaying an old season override it).
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            cur.execute(
                "select episode_number from episodes where season_id = %s",
                [str(season_id)],
            )
            existing = {r["episode_number"] for r in cur.fetchall()}

    number = tvmaze_season or season["season_number"]
    seasons = _fetch(f"/shows/{_SURVIVOR_SHOW_ID}/seasons", refresh)
    match = next((s for s in seasons if s["number"] == number), None)
    if match is None:
        raise HTTPException(
            status_code=404, detail=f"No TVmaze season numbered {number}"
        )
    episodes = _fetch(f"/seasons/{match['id']}/episodes", refresh)
    aired = [e for e in episodes if e.get("airdate") and e.get("airstamp")]

    return {
        "episodes": build_episode_proposal(aired, existing),
        "source": f"TVmaze — Survivor US season {number}",
    }
