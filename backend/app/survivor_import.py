"""Map survivoR episode data to a proposed batch of eliminations and scoring
events (issue #132). Pure functions only — fetching and API posting live in
scripts/import_episode.py. Everything here proposes; the admin reviews before
anything is written, and judgment-call events (blindsides, TV moments) are
surfaced as warnings instead of guessed.
"""

from typing import Optional

# survivoR boot_order.result → our elimination_type. Anything unlisted is
# skipped (finale placements) or warned about.
_SAFE_OUTCOMES = {"safe", "saved", "won"}

# advantage_details.advantage_type values that count as a real idol.
_IDOL_TYPES = {"Hidden Immunity Idol", "Hidden Immunity Idol Half"}


def _ep(rows: list[dict], season_key: str, episode: int) -> list[dict]:
    return [
        r
        for r in rows
        if r.get("version_season") == season_key and r.get("episode") == episode
    ]


def _season(rows: list[dict], season_key: str) -> list[dict]:
    return [r for r in rows if r.get("version_season") == season_key]


def map_elimination_type(result: str) -> Optional[str]:
    """boot_order.result → elimination_type, or None for non-eliminations."""
    r = result.lower()
    if "sole survivor" in r or "runner-up" in r:
        return None
    if "fire challenge" in r:
        return "fire_making_loss"
    if "medically evacuated" in r:
        return "medical_evacuation"
    if "voted out" in r:
        return "voted_out"
    if "quit" in r:
        return "quit"
    if "eliminated" in r:  # EoE-era generic wording
        return "voted_out"
    return None


def build_proposal(
    season_key: str,
    episode: int,
    *,
    vote_history: list[dict],
    boot_order: list[dict],
    challenge_results: list[dict],
    advantage_movement: list[dict],
    advantage_details: list[dict],
    castaways: list[dict],
) -> dict:
    """Build the proposed import for one episode.

    Returns {"eliminations": [...], "events": [...], "placements": [...],
    "warnings": [...]} where people are identified by survivoR castaway_id +
    display name; the caller maps those to contestant UUIDs.
    """
    eliminations: list[dict] = []
    events: list[dict] = []
    placements: list[dict] = []
    warnings: list[str] = []

    def add_event(cid: str, name: str, event_type: str, quantity: int = 1) -> None:
        events.append(
            {
                "castaway_id": cid,
                "name": name,
                "event_type": event_type,
                "quantity": quantity,
            }
        )

    # --- eliminations + placements (boot_order / castaways) ---
    for r in _ep(boot_order, season_key, episode):
        etype = map_elimination_type(r["result"])
        if etype is None:
            if "voted out" not in r["result"].lower():
                continue  # finale placement rows, handled below
        else:
            eliminations.append(
                {
                    "castaway_id": r["castaway_id"],
                    "name": r["castaway"],
                    "elimination_type": etype,
                    "result": r["result"],
                }
            )
        if etype == "voted_out" and "eliminated" in r["result"].lower():
            warnings.append(
                f"{r['castaway']}: result '{r['result']}' mapped to voted_out — verify"
            )

    for r in _season(castaways, season_key):
        if r.get("episode") == episode and r.get("place"):
            placements.append(
                {
                    "castaway_id": r["castaway_id"],
                    "name": r["castaway"],
                    "placement": r["place"],
                }
            )

    # --- tribal council votes ---
    vh = _ep(vote_history, season_key, episode)
    for r in vh:
        if r.get("nullified") and r.get("vote") == r.get("voted_out"):
            warnings.append(
                f"{r['castaway']}: correct vote was nullified — "
                "no points proposed, verify"
            )
            continue
        if r.get("vote") and r.get("voted_out") and r["vote"] == r["voted_out"]:
            add_event(r["castaway_id"], r["castaway"], "vote_correctly_at_tribal")

    votes_against: dict[str, dict] = {}
    for r in vh:
        target = r.get("vote_id")
        if not target or r.get("nullified"):
            continue
        entry = votes_against.setdefault(
            target, {"name": r.get("vote", "?"), "count": 0}
        )
        entry["count"] += 1
    for cid, v in votes_against.items():
        add_event(cid, v["name"], "votes_received", quantity=v["count"])
    if any(r.get("nullified") for r in vh):
        warnings.append("Nullified votes this episode — excluded from votes_received")

    # --- challenges ---
    flag_map = [
        ("won_tribal_immunity", "win_team_immunity"),
        ("won_team_immunity", "win_team_immunity"),
        ("won_tribal_reward", "win_team_reward"),
        ("won_team_reward", "win_team_reward"),
        ("won_individual_immunity", "win_individual_immunity"),
        ("won_individual_reward", "win_individual_reward"),
    ]
    for r in _ep(challenge_results, season_key, episode):
        for flag, event_type in flag_map:
            if r.get(flag):
                add_event(r["castaway_id"], r["castaway"], event_type)

    # --- fire-making and shot in the dark (vote_history special events) ---
    for r in vh:
        event = (r.get("vote_event") or "").lower()
        outcome = (r.get("vote_event_outcome") or "").lower()
        # Only "Won" is a fire win; "Saved"/"Immune" mark the non-participants
        # the immunity winner protected (S49 finale proved this the hard way).
        if event.startswith("fire challenge") and outcome == "won":
            add_event(r["castaway_id"], r["castaway"], "win_fire_making_challenge")
            warnings.append(
                f"{r['castaway']}: fire-making win inferred from outcome "
                f"'{r.get('vote_event_outcome')}' — verify"
            )
        if event == "shot in the dark" and outcome in _SAFE_OUTCOMES:
            add_event(r["castaway_id"], r["castaway"], "shot_in_the_dark_success")

    # --- advantages ---
    adv_type = {
        (d["version_season"], d["advantage_id"]): d.get("advantage_type", "?")
        for d in advantage_details
    }
    for r in _ep(advantage_movement, season_key, episode):
        atype = adv_type.get((season_key, r.get("advantage_id")), "?")
        event = r.get("event", "")
        cid, name = r["castaway_id"], r["castaway"]
        if event in ("Found", "Found (beware)", "Received", "Recieved"):
            if atype in _IDOL_TYPES:
                inactive = event == "Found (beware)" or "Half" in atype
                add_event(
                    cid,
                    name,
                    "acquire_inactive_idol" if inactive else "acquire_active_idol",
                )
            elif atype == "Extra Vote":
                add_event(cid, name, "acquire_extra_vote")
            else:
                add_event(cid, name, "acquire_other_advantage")
        elif event == "Activated":
            add_event(cid, name, "activate_inactive_idol")
        elif event == "Played":
            if atype in _IDOL_TYPES:
                if r.get("success") == "Yes":
                    add_event(cid, name, "idol_played_successfully")
                else:
                    warnings.append(
                        f"{name}: played {atype} unsuccessfully — no event proposed"
                    )
            elif atype == "Idol Nullifier":
                add_event(cid, name, "play_idol_nullifier")
            elif atype == "Extra Vote":
                add_event(cid, name, "use_extra_vote")
            elif atype == "Steal a Vote":
                add_event(cid, name, "use_steal_a_vote")
            else:
                warnings.append(f"{name}: played '{atype}' — map manually if scored")
        elif event == "Voted out with advantage":
            if atype in _IDOL_TYPES:
                add_event(cid, name, "eliminated_holding_idol")
            else:
                warnings.append(f"{name}: voted out holding '{atype}' — not an idol")
        # Expired/Absorbed/Banked etc. don't score; ignore silently.

    # --- jury ---
    for r in _season(castaways, season_key):
        if r.get("jury") and r.get("episode") == episode:
            add_event(r["castaway_id"], r["castaway"], "join_jury")

    warnings.append(
        "Judgment calls not proposed: blindside_with_active_idol, "
        "fake_idol_played, survivor_moment, background/cry/cuss, TV-moment tokens"
    )
    return {
        "eliminations": eliminations,
        "events": events,
        "placements": placements,
        "warnings": warnings,
    }
