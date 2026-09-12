"""Repair ballots where the Power Vote isn't the one unranked pick (#757).

The real submission path (picks.rerank_ballot) leaves the Power Vote's sealed
name unranked and ranks the rest 1..n, and both the locked Hub display and live
scoring read that invariant. Older bot runs and the #673 ×2 migration could
leave the sealed name ranked while a *different* pick was unranked, so the Hub
showed a regular vote above the Power Vote and scoring paid the stray name the
flat rate instead of its rung.

This re-ranks every double_vote_points ballot to the invariant, preserving the
existing ladder order of the untargeted names. Already-correct ballots (real
submissions, and bot ballots where the seal rode the extra) are untouched.
Idempotent.

Dry-runs by default; --apply commits.
Usage (from backend/): uv run python scripts/backfill_ballot_ranks.py [--apply]
  prod: uv run --env-file .env.prod python scripts/backfill_ballot_ranks.py [--apply]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import get_db  # noqa: E402
from app.routers.picks import rerank_ballot  # noqa: E402


def main() -> None:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "select user_id, league_season_id, episode_id,"
            "       target_contestant_id::text tgt"
            " from advantage_plays"
            " where advantage_type = 'double_vote_points'"
            "   and target_contestant_id is not null"
        )
        plays = cur.fetchall()
        fixed = 0
        for p in plays:
            cur.execute(
                "select contestant_id::text cid, rank from elimination_picks"
                " where user_id=%s and league_season_id=%s and episode_id=%s"
                " order by rank nulls last, created_at",
                (p["user_id"], p["league_season_id"], p["episode_id"]),
            )
            ballot = cur.fetchall()
            ordered = [r["cid"] for r in ballot]
            rank = 0
            desired = {
                cid: (None if cid == p["tgt"] else (rank := rank + 1))
                for cid in ordered
            }
            current = {r["cid"]: r["rank"] for r in ballot}
            if desired == current:
                continue
            fixed += 1
            rerank_ballot(
                cur,
                p["league_season_id"],
                p["episode_id"],
                p["user_id"],
                ordered,
                p["tgt"],
            )
        print(f"double_vote ballots: {len(plays)} total, {fixed} re-ranked")

        if "--apply" in sys.argv:
            conn.commit()
            print("APPLIED")
        else:
            conn.rollback()
            print("DRY RUN, rolled back")


if __name__ == "__main__":
    main()
