"""Map survivoR tribe data to our tribes + time-aware membership (#212).

Pure functions only — fetching and DB writes live in routers/tribes.py.
survivoR gives per-episode membership (tribe_mapping) and tribe colors
(tribe_colours); we collapse membership into change-points so a contestant's
current tribe is the row with the largest from_episode.
"""

# survivoR records the merge tribe's colour as black (#000000), which reads as
# "no colour" on a buff. Override it with something that looks like a real
# buff. Retune freely.
MERGE_COLOR = "#334155"


def build_tribe_data(
    season_key: str,
    *,
    tribe_colours: list[dict],
    tribe_mapping: list[dict],
    up_to_episode: int | None = None,
) -> dict:
    """Return {"tribes": [{name, color, is_merge}],
    "memberships": [{castaway_id, tribe_name, from_episode}]}.

    memberships holds only change-points (a row when a castaway's tribe differs
    from their previous episode), ordered per castaway by episode.

    `up_to_episode` bounds it to what a live season would know: change-points
    from later episodes are dropped, and only tribes actually reached by then
    are returned (so a future swap/merge isn't leaked before it airs).
    """
    all_colors: dict[str, dict] = {}
    for r in tribe_colours:
        if r.get("version_season") != season_key:
            continue
        name = r.get("tribe")
        if not name:
            continue
        is_merge = "merge" in (r.get("tribe_status") or "").lower()
        color = MERGE_COLOR if is_merge else (r.get("tribe_colour") or "#888888")
        all_colors[name] = {"name": name, "color": color, "is_merge": is_merge}

    rows = sorted(
        (r for r in tribe_mapping if r.get("version_season") == season_key),
        key=lambda r: (r.get("castaway_id") or "", r.get("episode") or 0),
    )
    memberships: list[dict] = []
    last: dict[str, str] = {}
    for r in rows:
        cid, tribe, ep = r.get("castaway_id"), r.get("tribe"), r.get("episode")
        if not cid or not tribe or ep is None:
            continue
        if up_to_episode is not None and ep > up_to_episode:
            continue
        if last.get(cid) != tribe:
            memberships.append(
                {"castaway_id": cid, "tribe_name": tribe, "from_episode": ep}
            )
            last[cid] = tribe

    used = {m["tribe_name"] for m in memberships}
    tribes = [all_colors[n] for n in all_colors if n in used]
    return {"tribes": tribes, "memberships": memberships}


def _demo() -> None:
    """Self-check: two-episode swap collapses to change-points; merge recolored."""
    colours = [
        {
            "version_season": "US28",
            "tribe": "Luzon",
            "tribe_colour": "#2FA976",
            "tribe_status": "Original",
        },
        {
            "version_season": "US28",
            "tribe": "Solarrion",
            "tribe_colour": "#000000",
            "tribe_status": "Merged",
        },
    ]
    mapping = [
        {"version_season": "US28", "castaway_id": "A", "tribe": "Luzon", "episode": 1},
        {"version_season": "US28", "castaway_id": "A", "tribe": "Luzon", "episode": 2},
        {
            "version_season": "US28",
            "castaway_id": "A",
            "tribe": "Solarrion",
            "episode": 6,
        },
        {
            "version_season": "US99",
            "castaway_id": "Z",
            "tribe": "Other",
            "episode": 1,
        },  # filtered
    ]
    out = build_tribe_data("US28", tribe_colours=colours, tribe_mapping=mapping)
    assert {t["name"] for t in out["tribes"]} == {"Luzon", "Solarrion"}
    merge = next(t for t in out["tribes"] if t["name"] == "Solarrion")
    assert merge["is_merge"] and merge["color"] == MERGE_COLOR, merge
    a = [m for m in out["memberships"] if m["castaway_id"] == "A"]
    assert [m["from_episode"] for m in a] == [1, 6], a  # ep-2 duplicate collapsed
    assert all(m["castaway_id"] != "Z" for m in out["memberships"])

    # Bounded to ep 1 (live season): the future merge is not leaked.
    early = build_tribe_data(
        "US28", tribe_colours=colours, tribe_mapping=mapping, up_to_episode=1
    )
    assert {t["name"] for t in early["tribes"]} == {"Luzon"}, early["tribes"]
    assert [m["from_episode"] for m in early["memberships"]] == [1]
    print("ok")


if __name__ == "__main__":
    _demo()
