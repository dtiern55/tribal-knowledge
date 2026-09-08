"""Copy one prod league-season onto staging as a frozen "Practice:" league.

The stage leagues are all David vs. Goliath, so a preview never shows another
season's cast, idol art, or a live practice run. This copies one season from
prod (cast, tribes, episodes, scored facts) plus one league's play in it into
a new league on staging, alongside the stages. Members map by email, or by
display name for the bot personas, which exist on both projects under
different emails. Open episodes lock in 2099 so the copy doesn't decay.

--fresh brings the show and the league's rule knobs but no play, and enrols
only Danny, so a season nobody has drafted yet starts pre-draft; add the bots
with `run_bots.py setup --league "Practice: ..."`.

Dry-runs by default; --apply commits. stage_staging.py leaves Practice: leagues alone.
Usage (from backend/):
    uv run python scripts/copy_season_to_staging.py 27 --league secondary [--apply]
    uv run python scripts/copy_season_to_staging.py 51 --league "Snakes and Rats" \
        --name "Practice: Survivor 51" --fresh [--apply]
"""

import argparse
import os
import sys
from datetime import timedelta
from pathlib import Path

import psycopg2
from dotenv import dotenv_values
from psycopg2.extras import RealDictCursor

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.database import get_db  # noqa: E402
from scripts.stage_staging import FROZEN, KEEP_EMAILS, copy_rows  # noqa: E402


def columns(cur, table: str) -> set[str]:
    cur.execute(
        "select column_name from information_schema.columns"
        " where table_schema = 'public' and table_name = %s",
        (table,),
    )
    return {r["column_name"] for r in cur.fetchall()}


def user_map(src, dst, user_ids: list[str]) -> dict[str, str]:
    """prod user id -> staging user id: same email, or the same bot persona."""
    src.execute(
        "select u.id, lower(u.email) email, p.display_name, p.is_bot from auth.users u"
        " join profiles p on p.id = u.id where u.id = any(%s::uuid[])",
        (user_ids,),
    )
    prod = src.fetchall()
    dst.execute(
        "select u.id, lower(u.email) email, p.display_name, p.is_bot from auth.users u"
        " join profiles p on p.id = u.id"
    )
    staging = dst.fetchall()
    by_email = {r["email"]: r["id"] for r in staging}
    by_persona = {r["display_name"]: r["id"] for r in staging if r["is_bot"]}
    ids, missing = {}, []
    for r in prod:
        hit = by_email.get(r["email"]) or (
            r["is_bot"] and by_persona.get(r["display_name"])
        )
        if hit:
            ids[r["id"]] = hit
        else:
            missing.append(r["email"])
    if missing:
        sys.exit(
            f"no staging account for {missing};"
            " copy_prod_to_staging.py can make placeholders"
        )
    return ids


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("season_number", type=int)
    parser.add_argument("--league", required=True, help="prod league whose run to copy")
    parser.add_argument(
        "--name", help='staging league name (default "Practice: <season>")'
    )
    parser.add_argument(
        "--fresh", action="store_true", help="show + knobs only; Danny alone, no play"
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    prod_env = dotenv_values(".env.prod")  # cwd is backend/, like copy_prod_to_staging
    prod_conn = psycopg2.connect(
        host=prod_env["DB_HOST"],
        port=prod_env.get("DB_PORT") or "5432",
        dbname=prod_env.get("DB_NAME") or "postgres",
        user=prod_env.get("DB_USER") or "postgres",
        password=prod_env["DB_PASSWORD"],
        cursor_factory=RealDictCursor,
    )
    prod_conn.set_session(readonly=True)
    src = prod_conn.cursor()
    with get_db() as conn:
        dst = conn.cursor()
        if os.environ["DB_HOST"] == prod_env["DB_HOST"]:
            sys.exit(".env and .env.prod point at the same database; refusing")

        src.execute(
            "select * from seasons where season_number = %s", (args.season_number,)
        )
        season = src.fetchone() or sys.exit(f"no prod season {args.season_number}")
        src.execute(
            "select ls.* from league_seasons ls join leagues l on l.id = ls.league_id"
            " where ls.season_id = %s and l.name = %s",
            (season["id"], args.league),
        )
        ls = src.fetchone() or sys.exit(
            f"{args.league!r} isn't playing season {args.season_number}"
        )
        src.execute(
            "select count(*) c from token_transactions where league_season_id = %s",
            (ls["id"],),
        )
        assert (
            src.fetchone()["c"] == 0
        ), "source has token rows; this script doesn't copy them"
        name = args.name or f"Practice: {season['name'].removeprefix('Survivor: ')}"
        dst.execute(
            "select 1 from seasons where season_number = %s", (args.season_number,)
        )
        assert (
            dst.fetchone() is None
        ), f"staging already has season {args.season_number}"
        dst.execute("select 1 from leagues where name = %s", (name,))
        assert dst.fetchone() is None, f"staging already has league {name!r}"

        dst.execute("select id from auth.users where email = %s", (KEEP_EMAILS[0],))
        danny = dst.fetchone()["id"]
        if args.fresh:
            users = {}
            members = [danny]
        else:
            src.execute(
                "select user_id from league_members where league_id = %s",
                (ls["league_id"],),
            )
            users = user_map(src, dst, [r["user_id"] for r in src.fetchall()])
            members = list(users.values())

        def copy(table, where, params, remap, override=None):
            return copy_rows(
                src,
                table,
                where,
                params,
                remap,
                override,
                dst=dst,
                cols=columns(dst, table),
            )

        seasons = copy("seasons", "id = %s", (season["id"],), {})
        by_season = {"season_id": seasons}
        for t in ("season_scoring_event_types", "season_prediction_score_types"):
            copy(t, "season_id = %s", (season["id"],), by_season)
        tribes = copy("tribes", "season_id = %s", (season["id"],), by_season)
        contestants = copy("contestants", "season_id = %s", (season["id"],), by_season)
        copy(
            "contestant_tribes",
            "tribe_id in (select id from tribes where season_id = %s)",
            (season["id"],),
            {"contestant_id": contestants, "tribe_id": tribes},
        )

        src.execute(
            "select min(episode_number) n from episodes"
            " where season_id = %s and status <> 'scored'",
            (season["id"],),
        )
        first_open = src.fetchone()["n"]

        def freeze(r):
            if r["status"] == "scored":
                return {}
            lock = FROZEN + timedelta(weeks=r["episode_number"] - first_open)
            return {
                "status": "upcoming",
                "picks_lock_at": lock,
                "air_date": lock.date(),
            }

        episodes = copy(
            "episodes", "season_id = %s", (season["id"],), by_season, freeze
        )
        in_season = "episode_id in (select id from episodes where season_id = %s)"
        by_episode = {"episode_id": episodes, "contestant_id": contestants}
        for t in ("eliminations", "scoring_events", "episode_insights"):
            copy(t, in_season, (season["id"],), by_episode)

        dst.execute(
            "insert into leagues (name, join_code) values (%s, %s) returning id",
            (name, f"practice-{args.season_number}"),
        )
        league = dst.fetchone()["id"]
        dst.executemany(
            "insert into league_members (league_id, user_id) values (%s, %s)",
            [(league, u) for u in members],
        )
        ls_map = copy(
            "league_seasons",
            "id = %s",
            (ls["id"],),
            by_season,
            lambda r: {"league_id": league},
        )
        by_ls = {
            "league_season_id": ls_map,
            "user_id": users,
            "contestant_id": contestants,
            "target_contestant_id": contestants,
            "episode_id": episodes,
        }
        if not args.fresh:
            in_ls = "league_season_id = %s"
            picks = copy(
                "roster_picks",
                in_ls,
                (ls["id"],),
                by_ls,
                lambda r: {"replaced_pick_id": None},
            )
            if "replaced_pick_id" in columns(src, "roster_picks"):
                src.execute(
                    f"select id, replaced_pick_id from roster_picks where {in_ls}"
                    " and replaced_pick_id is not null",
                    (ls["id"],),
                )
                for r in src.fetchall():
                    dst.execute(
                        "update roster_picks set replaced_pick_id = %s where id = %s",
                        (picks[r["replaced_pick_id"]], picks[r["id"]]),
                    )
            for t in ("elimination_picks", "advantage_plays"):
                copy(t, in_ls, (ls["id"],), by_ls)
            # Danny's acknowledgements stay behind so the copy shows him its recap once.
            copy(
                "reveal_acknowledgements",
                f"{in_ls} and user_id <> (select id from auth.users where email = %s)",
                (ls["id"], KEEP_EMAILS[0]),
                by_ls,
            )
            copy(
                "finale_predictions",
                in_ls,
                (ls["id"],),
                {
                    **by_ls,
                    "winner_contestant_id": contestants,
                    "final_four_contestant_ids": contestants,
                    "final_three_contestant_ids": contestants,
                },
            )

        new_ls = ls_map[ls["id"]]
        dst.execute(
            "select"
            " (select count(*) from league_members where league_id = %s) members,"
            " (select count(*) from episodes"
            "   where season_id = %s and status = 'scored') scored,"
            " (select count(*) from roster_picks where league_season_id = %s) rosters,"
            " (select count(*) from elimination_picks"
            "   where league_season_id = %s) ballots,"
            " (select count(*) from advantage_plays where league_season_id = %s) plays",
            (league, seasons[season["id"]], new_ls, new_ls, new_ls),
        )
        print(f"{name}: {dict(dst.fetchone())}")
        if args.apply:
            conn.commit()
            print("APPLIED")
        else:
            conn.rollback()
            print("DRY RUN, rolled back")
    prod_conn.close()


if __name__ == "__main__":
    main()
