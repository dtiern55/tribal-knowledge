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
    journeys: list[dict],
    advantage_movement: list[dict],
    advantage_details: list[dict],
    castaways: list[dict],
    tribe_mapping: list[dict] | None = None,
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
                    "is_final": True,
                }
            )
        if etype == "voted_out" and "eliminated" in r["result"].lower():
            warnings.append(
                f"{r['castaway']}: result '{r['result']}' mapped to voted_out — verify"
            )
        if etype is None and "switch" in r["result"].lower():
            warnings.append(
                f"{r['castaway']}: switched onto Redemption Island — no elimination,"
                " sync tribes to place them"
            )

    # --- Redemption Island (#655) ---
    # A boot who shows up on the island (this episode for a day-one vote, next
    # episode for a normal tribal) is still in the game: the ballot scores the
    # vote, but the row is not final. Losing a duel is the terminal exit, and
    # someone on the island last episode who is on a tribe this episode came
    # back. If survivoR has no next-episode mapping yet (live season), the
    # commissioner flips is_final in the admin UI instead.
    mapping = [
        r for r in (tribe_mapping or []) if r.get("version_season") == season_key
    ]

    def on_island(cid: str, ep: int) -> bool:
        return any(
            r.get("castaway_id") == cid
            and r.get("episode") == ep
            and "redemption" in (r.get("tribe_status") or "").lower()
            for r in mapping
        )

    def on_tribe(cid: str, ep: int) -> bool:
        return any(
            r.get("castaway_id") == cid
            and r.get("episode") == ep
            and r.get("tribe")
            and "redemption" not in (r.get("tribe_status") or "").lower()
            for r in mapping
        )

    if mapping:
        for e in eliminations:
            if e["elimination_type"] == "voted_out" and (
                on_island(e["castaway_id"], episode)
                or on_island(e["castaway_id"], episode + 1)
            ):
                e["is_final"] = False
                e["result"] += " → Redemption Island"
        for r in _ep(challenge_results, season_key, episode):
            if (r.get("challenge_type") or "").lower() == "duel" and (
                r.get("result") or ""
            ).lower() == "lost":
                eliminations.append(
                    {
                        "castaway_id": r["castaway_id"],
                        "name": r["castaway"],
                        "elimination_type": "redemption_loss",
                        "result": "Lost Redemption Island duel",
                        "is_final": True,
                    }
                )
        returned = {
            r["castaway_id"]: r["castaway"]
            for r in mapping
            if r.get("episode") == episode
            and on_tribe(r["castaway_id"], episode)
            and on_island(r["castaway_id"], episode - 1)
        }
        for cid, name in returned.items():
            add_event(cid, name, "return_from_redemption")

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
    episode_challenges = _ep(challenge_results, season_key, episode)
    for r in episode_challenges:
        for flag, event_type in flag_map:
            if r.get(flag):
                add_event(r["castaway_id"], r["castaway"], event_type)
    if any(
        r.get(flag)
        for r in episode_challenges
        for flag in (
            "won_tribal_immunity",
            "won_team_immunity",
            "won_tribal_reward",
            "won_team_reward",
        )
    ):
        warnings.append(
            "Team immunity/reward: survivoR credits only the challenge winner(s). "
            "Confirm who else was safe this episode and add them."
        )

    # --- journeys ---
    for r in _ep(journeys, season_key, episode):
        add_event(r["castaway_id"], r["castaway"], "go_on_journey")

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
    moves = _ep(advantage_movement, season_key, episode)
    # Give-away idols (S50 pattern, Danny's ruling 2026-07-19): an idol Found
    # and Received in the same episode was handed off — the finder held it
    # inactive, the hand-off activated it for the receiver.
    given_away = {
        r["advantage_id"]
        for r in moves
        if r.get("event") == "Found"
        and adv_type.get((season_key, r.get("advantage_id"))) in _IDOL_TYPES
        and any(
            m.get("event") in ("Received", "Recieved")
            and m.get("advantage_id") == r.get("advantage_id")
            for m in moves
        )
    }
    for r in moves:
        atype = adv_type.get((season_key, r.get("advantage_id")), "?")
        event = r.get("event", "")
        cid, name = r["castaway_id"], r["castaway"]
        if event in ("Found", "Found (beware)", "Received", "Recieved"):
            if atype in _IDOL_TYPES:
                if event in ("Received", "Recieved"):
                    add_event(cid, name, "activate_inactive_idol")
                    if r.get("advantage_id") not in given_away:
                        warnings.append(
                            f"{name}: received an idol found in an earlier"
                            " episode — verify the finder's acquire was"
                            " recorded as inactive"
                        )
                else:
                    inactive = (
                        event == "Found (beware)"
                        or "Half" in atype
                        or r.get("advantage_id") in given_away
                    )
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
                add_event(cid, name, "play_idol")
                votes_blocked = r.get("votes_nullified") or 0
                if votes_blocked:
                    add_event(
                        cid,
                        name,
                        "votes_blocked_by_idol",
                        quantity=int(votes_blocked),
                    )
                if r.get("success") == "Yes":
                    add_event(cid, name, "idol_played_successfully")
            elif atype == "Idol Nullifier":
                add_event(cid, name, "play_idol_nullifier")
                # Same split as the idol above (#535): the play scores on its
                # own, voiding a real idol pays the bonus. survivoR records
                # `success` for nullifiers — all three ever played landed.
                if r.get("success") == "Yes":
                    add_event(cid, name, "nullifier_played_successfully")
            else:
                add_event(cid, name, "play_other_advantage")
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
        "fake_idol_played, steal_immunity_idol, episode_title_quote, "
        "read_treemail_or_instructions, jeff_thats_how_you_do_it"
    )
    return {
        "eliminations": eliminations,
        "events": events,
        "placements": placements,
        "warnings": warnings,
    }
