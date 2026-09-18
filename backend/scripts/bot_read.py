"""Generate a week's bot read from a compact conviction + tiers description.

The weekly read is formulaic, so most of it is derivable. This turns a few
words — a conviction and a couple of tiny name tiers — into the
`bot_reads/season_N.json` episode entry (likely_boots weights + spread +
double_targets), instead of hand-tuned weights. Power ballots always follow the
votes, so that's baked in and never stated. Names may be short ("Laura B.");
they resolve against the season's roster.

    cd backend && uv run python scripts/bot_read.py --season 270 --episode 8 \
        --conviction lean \
        --favor "Aras, Hayden, Ciera" \
        --light "Katie, Tina" \
        --cold "Tyson, Vytas" \
        --double "Vytas, Tyson, Tina" \
        --swap-to "Ciera, Katie" --dry-run
    # looks right? drop --dry-run to write the entry, then run run_bots.

conviction: pileon (one clear target) | strong (a few share it) |
            lean (favored, small edge) | crapshoot (no read, spread wide).
"""

import argparse
import json
import re
from datetime import date
from pathlib import Path

READS = Path(__file__).parent / "bot_reads"

# conviction -> how steep the favored weights and how tight the spread. `top` is
# the first favored name (a pile-on's target); `favor` the rest of the favored.
WEIGHTS = {
    "pileon": {"top": 12, "favor": 4, "light": 2, "spread": 0},
    "strong": {"top": 7, "favor": 7, "light": 2, "spread": 0},
    "lean": {"top": 5, "favor": 5, "light": 2, "spread": 0},
    "crapshoot": {"top": 3, "favor": 3, "light": 1, "spread": 70},
}


def build_entry(conviction, favor, light, double, note, swap_to=()):
    """Compact read -> season_N.json episode entry (names already resolved)."""
    w = WEIGHTS[conviction]
    likely = [
        [name, w["top"] if i == 0 else w["favor"]] for i, name in enumerate(favor)
    ]
    likely += [[name, w["light"]] for name in light]
    entry = {
        "likely_boots": likely,
        "double_targets": double,
        "note": note,
        "spread": w["spread"],
    }
    if swap_to:
        entry["swap_targets"] = list(swap_to)
    return entry


def _matches(short, full):
    """A short name ("Laura B." / "Aras") against a full roster name."""
    parts = short.replace(".", "").split()
    full_parts = full.split()
    if not parts or full_parts[0].lower() != parts[0].lower():
        return False
    return len(parts) < 2 or (
        len(full_parts) > 1 and full_parts[-1][0].lower() == parts[1][0].lower()
    )


def resolve(name, roster):
    if name in roster:
        return name
    hits = [r for r in roster if _matches(name, r)]
    if len(hits) != 1:
        raise SystemExit(
            f"name {name!r} matched {len(hits)} roster names: {hits or 'none'}"
        )
    return hits[0]


def resolve_all(arg, roster):
    return [resolve(n.strip(), roster) for n in arg.split(",") if n.strip()]


def collapse_pairs(text):
    """Keep [name, weight] pairs on one line so the diff stays small."""
    return re.sub(r'\[\n\s+("(?:[^"\\]|\\.)*"),\n\s+(-?\d+)\n\s+\]', r"[\1, \2]", text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--episode", type=int, required=True)
    ap.add_argument("--conviction", choices=list(WEIGHTS), required=True)
    ap.add_argument("--favor", default="", help="favored boot names, comma-separated")
    ap.add_argument("--light", default="", help="capped-low names")
    ap.add_argument("--cold", default="", help="names that should get ~no votes")
    ap.add_argument("--double", default="", help="roster-double targets")
    ap.add_argument("--swap-to", default="", help="who swaps should lean toward")
    ap.add_argument("--note", default="", help="override the auto note")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    path = READS / f"season_{a.season}.json"
    data = json.loads(path.read_text())
    roster = data.get("draft", [])

    favor = resolve_all(a.favor, roster)
    light = resolve_all(a.light, roster)
    cold = resolve_all(a.cold, roster)
    double = resolve_all(a.double, roster)
    swap_to = resolve_all(a.swap_to, roster)
    overlap = (set(favor) | set(light)) & set(cold)
    if overlap:
        raise SystemExit(f"cold names are also favored/light: {sorted(overlap)}")

    note = a.note or (
        f"{a.conviction} read (Danny, {date.today()}). "
        f"favor: {', '.join(favor) or 'none'}; light: {', '.join(light) or 'none'}; "
        f"cold: {', '.join(cold) or 'none'}. Power ballots follow the votes."
        + (f" Swaps lean to: {', '.join(swap_to)}." if swap_to else "")
    )
    entry = build_entry(a.conviction, favor, light, double, note, swap_to)
    print(json.dumps({str(a.episode): entry}, indent=1))
    if a.dry_run:
        print("\n--dry-run: not written.")
        return

    data.setdefault("episodes", {})[str(a.episode)] = entry
    path.write_text(collapse_pairs(json.dumps(data, indent=1)) + "\n")
    print(f"\nwrote episode {a.episode} to {path.name}. Now run the bots:")
    print(
        f"  uv run --env-file .env.prod python scripts/run_bots.py "
        f"week {a.episode} --league <league> --season {a.season}"
    )


if __name__ == "__main__":
    main()
