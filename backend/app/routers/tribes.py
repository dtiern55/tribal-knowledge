"""Import tribes + time-aware membership from survivoR (#212).

Admin-triggered sync, re-runnable: rebuilds membership from survivoR's
per-episode data so re-running after a swap/merge just picks up the change.
Colors and membership are authoritative in survivoR — no review step, unlike
scoring's judgment calls.

Data: https://github.com/doehm/survivoR (CC BY).
"""

import json
import time
import urllib.request
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin
from app.tribe_import import build_tribe_data

router = APIRouter(tags=["tribes"])

_RAW = "https://raw.githubusercontent.com/doehm/survivoR/master/dev/json"
_FILES = ["tribe_colours", "tribe_mapping", "castaways"]
_TTL_SECONDS = 3600
_cache: dict[str, tuple[float, list[dict]]] = {}


def _fetch(refresh: bool) -> dict[str, list[dict]]:
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


@router.post("/seasons/{season_id}/sync-tribes")
def sync_tribes(
    season_id: UUID,
    source_season: int | None = None,
    up_to_episode: int | None = None,
    refresh: bool = False,
    _: UUID = Depends(get_current_admin),
):
    """Rebuild the season's tribes + contestant membership from survivoR.

    source_season is the US season number; defaults to the league season's own
    number (practice seasons replaying an old season override it).

    up_to_episode bounds it to what a live season would know: pass the latest
    aired episode so future swaps/merges aren't leaked. Omit it only for a
    finished season where the final state is wanted. Re-run each week with a
    higher number as episodes air.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select season_number from seasons where id = %s", [str(season_id)]
            )
            season = cur.fetchone()
            if not season:
                raise HTTPException(status_code=404, detail="Season not found")
            cur.execute(
                "select id, name from contestants where season_id = %s",
                [str(season_id)],
            )
            cast = cur.fetchall()

            season_key = f"US{source_season or season['season_number']}"
            data = _fetch(refresh)
            built = build_tribe_data(
                season_key,
                tribe_colours=data["tribe_colours"],
                tribe_mapping=data["tribe_mapping"],
                up_to_episode=up_to_episode,
            )
            if not built["tribes"]:
                raise HTTPException(
                    status_code=404, detail=f"No survivoR tribe data for {season_key}"
                )

            # castaway_id -> our contestant id, by name (short or full), as the
            # scoring import does; unmatched names are reported, never guessed.
            by_name = {c["name"].lower(): str(c["id"]) for c in cast}
            names = {
                r["castaway_id"]: (r.get("castaway"), r.get("full_name"))
                for r in data["castaways"]
                if r.get("version_season") == season_key
            }

            # Full rebuild so a re-run (and the up_to_episode bound) never leaves
            # a stale tribe or membership behind. contestant_tribes first (FK).
            cur.execute(
                "delete from contestant_tribes where contestant_id in"
                " (select id from contestants where season_id = %s)",
                [str(season_id)],
            )
            cur.execute("delete from tribes where season_id = %s", [str(season_id)])

            tribe_id: dict[str, str] = {}
            for t in built["tribes"]:
                cur.execute(
                    """
                    insert into tribes (season_id, name, color, is_merge)
                    values (%s, %s, %s, %s) returning id
                    """,
                    [str(season_id), t["name"], t["color"], t["is_merge"]],
                )
                tribe_id[t["name"]] = str(cur.fetchone()["id"])
            applied = 0
            unmatched: set[str] = set()
            for m in built["memberships"]:
                short, full = names.get(m["castaway_id"], (None, None))
                our = by_name.get((short or "").lower()) or by_name.get(
                    (full or "").lower()
                )
                tid = tribe_id.get(m["tribe_name"])
                if not our:
                    if short or full:
                        unmatched.add(f"{short} / {full}")
                    continue
                if not tid:
                    continue
                cur.execute(
                    """
                    insert into contestant_tribes
                        (contestant_id, tribe_id, from_episode)
                    values (%s, %s, %s)
                    on conflict (contestant_id, from_episode)
                    do update set tribe_id = excluded.tribe_id
                    """,
                    [our, tid, m["from_episode"]],
                )
                applied += 1

    return {
        "tribes": len(built["tribes"]),
        "memberships_applied": applied,
        "unmatched": sorted(unmatched),
        "source": season_key,
    }
