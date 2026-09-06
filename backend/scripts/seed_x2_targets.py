"""Convert staging's #303-era Extra Vote ×2 plays to the named-pick rule (#673).

The frozen stage leagues were cloned from a sandbox that played the old
whole-ballot double, so every bot ×2 sits on the ballot with no target. This
gives each one a target and the extra ballot name the new rule allows, so the
previews show the ×2 the way a real season will: some hit, some miss on a
ballot that hit elsewhere, some miss outright. The outcome is keyed on the
bot's name and episode so every stage tells the same story.

Dry-runs by default; --apply commits.
Usage (from backend/): uv run python scripts/seed_x2_targets.py [--apply]
"""

import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import get_db  # noqa: E402


def outcome(display_name: str, episode_number: int) -> str:
    """'hit' for a third of the plays, 'miss' for the rest; stable across stages."""
    digest = hashlib.sha256(f"{display_name}:{episode_number}".encode()).digest()
    return "hit" if digest[0] % 3 == 0 else "miss"


def main() -> None:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("""
            select ap.id play_id, ap.user_id, ap.league_season_id, ap.episode_id,
                   p.display_name, e.episode_number,
                   array_agg(ep.contestant_id::text)
                     filter (where ep.id is not null) picks,
                   (select array_agg(el.contestant_id::text) from eliminations el
                     where el.episode_id = e.id and el.is_final) eliminated,
                   (select array_agg(c.id::text order by c.name) from contestants c
                     where c.season_id = e.season_id and not exists (
                       select 1 from eliminations x
                       join episodes xe on xe.id = x.episode_id
                       where x.contestant_id = c.id and x.is_final
                         and xe.episode_number < e.episode_number)) still_in
            from advantage_plays ap
            join profiles p on p.id = ap.user_id and p.is_bot
            join episodes e on e.id = ap.episode_id
            left join elimination_picks ep
              on ep.user_id = ap.user_id
             and ep.league_season_id = ap.league_season_id
             and ep.episode_id = ap.episode_id
            where ap.advantage_type = 'double_vote_points'
              and ap.target_contestant_id is null
            group by ap.id, p.display_name, e.id
            order by p.display_name, e.episode_number
            """)
        tally = {"hit": 0, "miss": 0}
        for row in cur.fetchall():
            picks = row["picks"] or []
            eliminated = row["eliminated"] or []
            want = outcome(row["display_name"], row["episode_number"])
            on_ballot_hit = [c for c in picks if c in eliminated]
            if want == "hit" and on_ballot_hit:
                # Already wrote the name down: the ×2 rides that pick.
                target = on_ballot_hit[0]
            elif want == "hit" and eliminated:
                # The extra name is the one who went home.
                target = eliminated[0]
            else:
                # A wrong name that was still in the game and not on the ballot.
                # Unscored open episodes land here too: nothing to hit yet.
                candidates = [
                    c for c in row["still_in"] if c not in picks and c not in eliminated
                ]
                digest = hashlib.sha256(
                    f"{row['display_name']}:{row['episode_number']}:name".encode()
                ).digest()
                target = candidates[digest[0] % len(candidates)]
            if target not in picks:
                cur.execute(
                    "insert into elimination_picks"
                    " (user_id, league_season_id, episode_id, contestant_id)"
                    " values (%s, %s, %s, %s)",
                    (
                        row["user_id"],
                        row["league_season_id"],
                        row["episode_id"],
                        target,
                    ),
                )
            cur.execute(
                "update advantage_plays set target_contestant_id = %s where id = %s",
                (target, row["play_id"]),
            )
            tally["hit" if target in eliminated else "miss"] += 1
        print("×2 plays targeted:", tally)

        if "--apply" in sys.argv:
            conn.commit()
            print("APPLIED")
        else:
            conn.rollback()
            print("DRY RUN, rolled back")


if __name__ == "__main__":
    main()
