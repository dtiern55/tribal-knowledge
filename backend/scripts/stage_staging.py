"""Rebuild staging as frozen snapshots of one finished season, one league per stage.

Every lock in the app follows episode lock times, so a preview can only show
"before episode 2" if some season is actually sitting there. This clones the
fully scored David vs. Goliath season on staging into one season per stage,
truncated at that stage's episode, with every open episode's lock in 2099 so
the snapshot never decays. Each stage gets its own league so the drawer lists
them side by side. Everything else on staging goes: other seasons, other
leagues, and every account that isn't Danny, the producer, or a bot.

Dry-runs by default; --apply commits.
Usage (from backend/): uv run python scripts/stage_staging.py [--apply]

Adding one stage later, once the source is gone, clones it from the
"complete" stage instead (a full copy of the source) and deletes nothing:
  uv run python scripts/stage_staging.py --add finale-locked [--apply]
"""

import sys
import uuid
from datetime import datetime, timedelta, timezone

from psycopg2.extras import Json

from app.database import get_db

SOURCE_SEASON = "Survivor: David vs. Goliath"
SOURCE_LEAGUE = "sandbox"
KEEP_EMAILS = ["dannyjtierney@gmail.com", "dannyjtierney+producer@gmail.com"]

# (slug, episodes scored, whether the next episode's picks have locked)
STAGES = [
    ("pre-draft", 0, False),
    ("before-ep2", 1, False),
    ("swap-window", 5, False),
    ("post-merge", 7, False),
    ("locked-not-scored", 8, True),
    ("jury-locked", 10, False),
    ("finale", 12, False),
    ("complete", 13, False),
    # Finale night after the lock: bracket frozen, nothing scored (#685).
    ("finale-locked", 12, True),
    # The morning after your first castaway is voted out (#717): episode 4
    # scored, nothing filed for 5 yet, the free swap still in hand.
    ("first-loss", 4, False),
]
# Stages where nothing has been filed for the open episode: pending swaps,
# ballots and plays into it stay behind, so the week is still to be played.
FRESH = {"first-loss"}

FROZEN = datetime(2099, 1, 6, 1, 0, tzinfo=timezone.utc)  # a Wednesday 7pm Central
YESTERDAY = datetime.now(timezone.utc) - timedelta(days=1)
# The only non-scalar columns besides finale_predictions' uuid[] lists.
JSONB_COLUMNS = {"bio_qa", "elimination_pick_schedule"}


def copy_rows(cur, table, where, params, remap, override=None):
    """Copy matching rows back into `table` with fresh ids; return old id -> new id."""
    cur.execute(f"select * from {table} where {where}", params)
    id_map = {}
    for row in cur.fetchall():
        new = dict(row)
        if "id" in new:
            new["id"] = str(uuid.uuid4())
            id_map[row["id"]] = new["id"]
        for col, mapping in remap.items():
            v = new.get(col)
            if isinstance(v, str) and v.startswith("{"):  # uuid[] arrives as '{a,b}'
                new[col] = [mapping[x] for x in v[1:-1].split(",")]
            elif v is not None:
                new[col] = mapping[v]
        if override:
            new.update(override(row))
        for c in JSONB_COLUMNS & new.keys():
            if new[c] is not None:
                new[c] = Json(new[c])
        cols = ", ".join(new)
        vals = ", ".join(
            f"%({c})s::uuid[]" if isinstance(v, list) else f"%({c})s"
            for c, v in new.items()
        )
        cur.execute(f"insert into {table} ({cols}) values ({vals})", new)
    return id_map


def clone_stage(cur, src_season, src_ls, members, index, slug, scored, next_locked):
    """One frozen copy of the source season and league-season, cut after `scored`."""
    open_ep = scored + 1
    # What has been filed so far: through the open episode, or only the scored ones.
    filed_ep = scored if slug in FRESH else open_ep
    status = "upcoming" if scored == 0 else "completed" if scored == 13 else "active"
    seasons = copy_rows(
        cur,
        "seasons",
        "id = %s",
        (src_season,),
        {},
        # season_number is unique; 37xx reads as "David vs. Goliath, stage xx".
        # The source may itself be a stage (--add), so strip its suffix first.
        lambda r: {
            "name": f"{r['name'].split(' (')[0]} ({slug})",
            "status": status,
            "season_number": (
                r["season_number"] // 100
                if r["season_number"] >= 100
                else r["season_number"]
            )
            * 100
            + index,
        },
    )
    season = seasons[src_season]
    by_season = {"season_id": seasons}
    for t in ("season_scoring_event_types", "season_prediction_score_types"):
        copy_rows(cur, t, "season_id = %s", (src_season,), by_season)
    tribes = copy_rows(cur, "tribes", "season_id = %s", (src_season,), by_season)
    # Placement rides in after the finale so the sync trigger doesn't fire early.
    contestants = copy_rows(
        cur,
        "contestants",
        "season_id = %s",
        (src_season,),
        by_season,
        lambda r: {"placement": None},
    )
    copy_rows(
        cur,
        "contestant_tribes",
        "tribe_id in (select id from tribes where season_id = %s)"
        " and from_episode <= %s",
        (src_season, max(scored, 1)),
        {"contestant_id": contestants, "tribe_id": tribes},
    )

    def episode_state(r):
        n = r["episode_number"]
        if n <= scored:
            return {}
        if n == open_ep and next_locked:
            lock = YESTERDAY
        else:
            lock = FROZEN + timedelta(weeks=n - open_ep)
        return {"status": "upcoming", "picks_lock_at": lock, "air_date": lock.date()}

    episodes = copy_rows(
        cur, "episodes", "season_id = %s", (src_season,), by_season, episode_state
    )
    scored_eps = (
        "episode_id in (select id from episodes"
        " where season_id = %s and episode_number <= %s)"
    )
    by_episode = {"episode_id": episodes, "contestant_id": contestants}
    for t in ("eliminations", "scoring_events", "episode_insights"):
        copy_rows(cur, t, scored_eps, (src_season, scored), by_episode)
    if scored == 13:
        # The trigger re-syncs finale placement events (delete + insert): no dupes.
        cur.execute(
            "update contestants c set placement = s.placement from contestants s"
            " where s.season_id = %s and c.season_id = %s and c.name = s.name",
            (src_season, season),
        )

    cur.execute(
        "insert into leagues (name, join_code) values (%s, %s) returning id",
        (f"Stage: {slug}", f"stage-{slug}"),
    )
    league = cur.fetchone()["id"]
    cur.executemany(
        "insert into league_members (league_id, user_id) values (%s, %s)",
        [(league, u) for u in members],
    )
    # Real leagues run on the defaults (swap lock = jury + 2, advantages open
    # until the finale), so the stages do too rather than inheriting old knobs.
    ls_map = copy_rows(
        cur,
        "league_seasons",
        "id = %s",
        (src_ls,),
        by_season,
        lambda r: {
            "league_id": league,
            "swap_lock_episode": None,
            "advantage_lock_episode": None,
        },
    )
    ls = ls_map[src_ls]
    by_ls = {
        "league_season_id": ls_map,
        "contestant_id": contestants,
        "target_contestant_id": contestants,
        "episode_id": episodes,
    }
    in_ls = "league_season_id = %s and user_id = any(%s::uuid[])"
    copy_rows(
        cur,
        "roster_picks",
        f"{in_ls} and active_from_episode <= %s",
        (src_ls, members, filed_ep),
        by_ls,
        # A swap into an episode not yet filed is not made yet: its outgoing
        # pick reads as still held.
        lambda r: (
            {"active_until_episode": None}
            if r["active_until_episode"] is not None
            and r["active_until_episode"] >= filed_ep
            else {}
        ),
    )
    # Ballots and plays already filed for the open episode come along, as they
    # would be mid-week; scored-episode acknowledgements too, except Danny's so
    # every stage still shows him its recap once.
    open_eps = scored_eps
    for t in ("elimination_picks", "advantage_plays"):
        copy_rows(
            cur,
            t,
            f"{in_ls} and {open_eps}",
            (src_ls, members, src_season, filed_ep),
            by_ls,
        )
    copy_rows(
        cur,
        "reveal_acknowledgements",
        f"{in_ls} and {open_eps}"
        " and user_id <> (select id from auth.users where email = %s)",
        (src_ls, members, src_season, scored, KEEP_EMAILS[0]),
        by_ls,
    )
    if scored >= 12:
        copy_rows(
            cur,
            "finale_predictions",
            in_ls,
            (src_ls, members),
            {
                **by_ls,
                "winner_contestant_id": contestants,
                "final_four_contestant_ids": contestants,
                "final_three_contestant_ids": contestants,
            },
        )
    return season, league, ls


def add_stage(slug: str) -> None:
    """Clone one stage from the "complete" stage, leaving the rest untouched."""
    index = [s for s, _, _ in STAGES].index(slug) + 1
    _, scored, next_locked = STAGES[index - 1]
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute(
            "select ls.id, ls.season_id from league_seasons ls"
            " join leagues l on l.id = ls.league_id where l.name = %s",
            ("Stage: complete",),
        )
        src = cur.fetchone()
        cur.execute(
            "select lm.user_id from league_members lm"
            " join leagues l on l.id = lm.league_id where l.name = %s",
            ("Stage: complete",),
        )
        members = [r["user_id"] for r in cur.fetchall()]
        cur.execute("select 1 from leagues where name = %s", (f"Stage: {slug}",))
        assert cur.fetchone() is None, f"Stage: {slug} already exists"
        clone_stage(
            cur, src["season_id"], src["id"], members, index, slug, scored, next_locked
        )
        print(f"Stage: {slug} cloned from Stage: complete")
        if "--apply" in sys.argv:
            conn.commit()
            print("APPLIED")
        else:
            conn.rollback()
            print("DRY RUN, rolled back")


def main() -> None:
    if "--add" in sys.argv:
        add_stage(sys.argv[sys.argv.index("--add") + 1])
        return
    with get_db() as conn:
        cur = conn.cursor()
        cur.execute("select id from seasons where name = %s", (SOURCE_SEASON,))
        src_season = cur.fetchone()["id"]
        cur.execute(
            "select ls.id from league_seasons ls join leagues l on l.id = ls.league_id"
            " where ls.season_id = %s and l.name = %s",
            (src_season, SOURCE_LEAGUE),
        )
        src_ls = cur.fetchone()["id"]
        cur.execute(
            "select count(*) c from token_transactions where league_season_id = %s",
            (src_ls,),
        )
        assert (
            cur.fetchone()["c"] == 0
        ), "source has token rows; this script doesn't copy them"

        cur.execute(
            "delete from auth.users where id not in"
            " (select id from profiles where is_bot or email = any(%s))"
            " returning email",
            (KEEP_EMAILS,),
        )
        print("deleted users:", [r["email"] for r in cur.fetchall()])
        cur.execute(
            "select lm.user_id from league_members lm"
            " join leagues l on l.id = lm.league_id where l.name = %s",
            (SOURCE_LEAGUE,),
        )
        members = [r["user_id"] for r in cur.fetchall()]

        keep_seasons, keep_leagues, keep_ls = [], [], []
        for i, (slug, scored, next_locked) in enumerate(STAGES, 1):
            season, league, ls = clone_stage(
                cur, src_season, src_ls, members, i, slug, scored, next_locked
            )
            keep_seasons.append(season)
            keep_leagues.append(league)
            keep_ls.append(ls)
            cur.execute(
                "select"
                " (select count(*) from roster_picks"
                "   where league_season_id = %s) rosters,"
                " (select count(*) from elimination_picks"
                "   where league_season_id = %s) ballots,"
                " (select count(*) from scoring_events se"
                "   join episodes e on e.id = se.episode_id"
                "   where e.season_id = %s) events",
                (ls, ls, season),
            )
            print(f"Stage: {slug:18} {dict(cur.fetchone())}")

        # Play tables first: a NO ACTION FK (advantage_plays.target_contestant_id)
        # trips if contestants cascade away before their plays do.
        cur.execute(
            "delete from league_seasons where id <> all(%s::uuid[])", (keep_ls,)
        )
        cur.execute(
            "delete from seasons where id <> all(%s::uuid[]) returning name",
            (keep_seasons,),
        )
        print("deleted seasons:", [r["name"] for r in cur.fetchall()])
        cur.execute(
            "delete from leagues where id <> all(%s::uuid[]) returning name",
            (keep_leagues,),
        )
        print("deleted leagues:", [r["name"] for r in cur.fetchall()])

        if "--apply" in sys.argv:
            conn.commit()
            print("APPLIED")
        else:
            conn.rollback()
            print("DRY RUN, rolled back")


if __name__ == "__main__":
    main()
