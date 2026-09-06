"""Give the locked-not-scored stage every row state the Locked page can show (#685).

Its episode 9 is locked and unscored, frozen that way, so it is the fixture
for the Locked page and the league hub. Out of the box every player has a
ballot and a play, and Danny's ×2 is a #303-era whole-ballot double. This
fills the gaps, each step skipped once it holds:

- Danny: a named ×2 on a third vote, the way a live season plays it.
- Mixed Bot 4: a tribe swap into episode 9 (swaps are not a play, #404:
  the outgoing pick closes at episode 8 and the newcomer starts at 9).
- Mixed Bot 5: no play that week.
- Mixed Bot 6: no ballot that week.

Dry-runs by default; --apply commits.
Usage (from backend/): uv run python scripts/seed_locked_stage.py [--apply]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import get_db  # noqa: E402

STAGE = "Stage: locked-not-scored"
EPISODE = 9
DANNY = "dannyjtierney@gmail.com"


def still_in(cur, season_id: str) -> list[str]:
    """Contestants not finally eliminated before the locked episode, by name."""
    cur.execute(
        """
        select c.id::text as id from contestants c
        where c.season_id = %s and not exists (
          select 1 from eliminations x join episodes e on e.id = x.episode_id
          where x.contestant_id = c.id and x.is_final and e.episode_number < %s)
        order by c.name
        """,
        (season_id, EPISODE),
    )
    return [r["id"] for r in cur.fetchall()]


def user_id(cur, display_name: str) -> str:
    cur.execute("select id from profiles where display_name = %s", (display_name,))
    return cur.fetchone()["id"]


def main() -> None:
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            select ls.id as ls, ls.season_id, ls.free_swaps, ls.swap_penalty_step,
                   ls.swap_penalty_floor, e.id as episode
            from league_seasons ls
            join leagues l on l.id = ls.league_id
            join episodes e on e.season_id = ls.season_id and e.episode_number = %s
            where l.name = %s
            """,
            (EPISODE, STAGE),
        )
        stage = cur.fetchone()
        ls, season_id, episode = stage["ls"], stage["season_id"], stage["episode"]
        field = still_in(cur, season_id)

        def ballot(uid: str) -> list[str]:
            cur.execute(
                "select contestant_id::text as id from elimination_picks"
                " where user_id = %s and league_season_id = %s and episode_id = %s",
                (uid, ls, episode),
            )
            return [r["id"] for r in cur.fetchall()]

        # Danny: name the ×2 on a third vote.
        cur.execute("select id from auth.users where email = %s", (DANNY,))
        danny = cur.fetchone()["id"]
        cur.execute(
            "select id, target_contestant_id from advantage_plays"
            " where user_id = %s and league_season_id = %s and episode_id = %s"
            " and advantage_type = 'double_vote_points'",
            (danny, ls, episode),
        )
        play = cur.fetchone()
        if play and play["target_contestant_id"] is None:
            votes = ballot(danny)
            target = next(c for c in field if c not in votes)
            cur.execute(
                "insert into elimination_picks"
                " (user_id, league_season_id, episode_id, contestant_id)"
                " values (%s, %s, %s, %s)",
                (danny, ls, episode, target),
            )
            cur.execute(
                "update advantage_plays set target_contestant_id = %s where id = %s",
                (target, play["id"]),
            )
            print("Danny: ×2 named on a third vote")
        else:
            print("Danny: ×2 already named")

        # Mixed Bot 4: swap into the locked episode. Keep the doubled castaway;
        # drop the first other active pick and bring in someone never rostered.
        bot = user_id(cur, "Mixed Bot 4")
        cur.execute(
            "select 1 from roster_picks where user_id = %s and league_season_id = %s"
            " and active_from_episode = %s",
            (bot, ls, EPISODE),
        )
        if cur.fetchone():
            print("Mixed Bot 4: already swapped into the episode")
        else:
            cur.execute(
                """
                select rp.id from roster_picks rp
                where rp.user_id = %s and rp.league_season_id = %s
                  and rp.active_until_episode is null
                  and rp.contestant_id not in (
                    select target_contestant_id from advantage_plays
                    where user_id = %s and league_season_id = %s and episode_id = %s
                      and target_contestant_id is not null)
                order by rp.contestant_id limit 1
                """,
                (bot, ls, bot, ls, episode),
            )
            outgoing = cur.fetchone()
            cur.execute(
                "select contestant_id::text as id from roster_picks"
                " where user_id = %s and league_season_id = %s",
                (bot, ls),
            )
            ever = {r["id"] for r in cur.fetchall()}
            incoming = next(c for c in field if c not in ever)
            cur.execute(
                "select count(*) as n from roster_picks where user_id = %s"
                " and league_season_id = %s and active_until_episode is not null",
                (bot, ls),
            )
            # Priced the way the swap endpoint prices it (#404).
            ordinal = cur.fetchone()["n"] + 1
            penalty = (
                0
                if ordinal <= stage["free_swaps"]
                else max(
                    stage["swap_penalty_step"] * ordinal, stage["swap_penalty_floor"]
                )
            )
            cur.execute(
                "update roster_picks set active_until_episode = %s,"
                " swap_penalty_points = %s where id = %s",
                (EPISODE - 1, penalty, outgoing["id"]),
            )
            cur.execute(
                "insert into roster_picks"
                " (user_id, league_season_id, contestant_id, active_from_episode)"
                " values (%s, %s, %s, %s)",
                (bot, ls, incoming, EPISODE),
            )
            print("Mixed Bot 4: swapped into the episode")

        # Mixed Bot 5: no play that week.
        bot = user_id(cur, "Mixed Bot 5")
        cur.execute(
            "delete from advantage_plays where user_id = %s and league_season_id = %s"
            " and episode_id = %s",
            (bot, ls, episode),
        )
        print(f"Mixed Bot 5: {cur.rowcount} play removed")

        # Mixed Bot 6: no ballot that week.
        bot = user_id(cur, "Mixed Bot 6")
        cur.execute(
            "delete from elimination_picks where user_id = %s and league_season_id = %s"
            " and episode_id = %s",
            (bot, ls, episode),
        )
        print(f"Mixed Bot 6: {cur.rowcount} votes removed")

        if "--apply" in sys.argv:
            conn.commit()
            print("APPLIED")
        else:
            conn.rollback()
            print("DRY RUN, rolled back")


if __name__ == "__main__":
    main()
