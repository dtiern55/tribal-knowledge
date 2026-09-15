"""Copy players' picks for an episode from a source league to a target league —
the pre-lock companion to transfer_episode.py (#737).

The secondary league runs ahead; this mirrors the mirror-players' own play
(ballot + advantage play + a roster swap that episode) into the qa league so
they aren't re-entered by hand. Copies ONLY the named players' rows — real
humans (e.g. Casali) keep their own picks. Writes straight to the DB like
run_bots.py (one transaction, one commit). The target episode must be OPEN, so
this is a normal pre-lock ballot, not a post-lock insert.

    cd backend && uv run --env-file .env.prod python scripts/copy_player_picks.py \
        --source-league secondary --target-league qa --episode 5 \
        --player "Danny Fairplay" --bots --dry-run
    # looks right? drop --dry-run.

--player copies one member by name; --bots copies every bot member of the target
league (bot accounts are shared across leagues). Pass either or both.
Contestants are matched by exact name (each league is its own season copy).
"""

import argparse
import os
import sys
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import RealDictCursor


def connect():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ.get("DB_PORT", "6543"),
        dbname=os.environ.get("DB_NAME", "postgres"),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        cursor_factory=RealDictCursor,
    )


def q(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchall()


def resolve_ls(cur, league, season_number):
    rows = q(
        cur,
        "select ls.id, ls.season_id, ls.league_id, ls.free_swaps,"
        " ls.swap_penalty_step, ls.swap_penalty_floor, s.season_number, s.name"
        " from league_seasons ls join leagues l on l.id = ls.league_id"
        " join seasons s on s.id = ls.season_id where l.name = %s",
        [league],
    )
    if season_number is not None:
        rows = [r for r in rows if r["season_number"] == season_number]
    if len(rows) != 1:
        opts = ", ".join(f"{r['name']} (season {r['season_number']})" for r in rows)
        raise SystemExit(
            f"League {league!r} matched {len(rows)} seasons: {opts or '-'}"
        )
    return rows[0]


def episode(cur, season_id, n):
    rows = q(
        cur,
        "select id, status, picks_lock_at from episodes"
        " where season_id = %s and episode_number = %s",
        [season_id, n],
    )
    if not rows:
        raise SystemExit(f"season {season_id} has no episode {n}")
    return rows[0]


def contestants(cur, season_id):
    rows = q(cur, "select id, name from contestants where season_id = %s", [season_id])
    return {r["id"]: r["name"] for r in rows}, {r["name"]: r["id"] for r in rows}


def target_players(cur, tgt, player, bots):
    """{user_id: display_name} to copy — one named --player and/or all --bots."""
    out = {}
    if bots:
        for r in q(
            cur,
            "select p.id, p.display_name from profiles p"
            " join league_members m on m.user_id = p.id"
            " where m.league_id = %s and p.is_bot",
            [tgt["league_id"]],
        ):
            out[r["id"]] = r["display_name"]
    if player:
        rows = q(
            cur,
            "select p.id, p.display_name from profiles p"
            " join league_members m on m.user_id = p.id"
            " where p.display_name = %s and m.league_id = %s",
            [player, tgt["league_id"]],
        )
        if len(rows) != 1:
            raise SystemExit(f"{player!r} matched {len(rows)} members of target league")
        out[rows[0]["id"]] = rows[0]["display_name"]
    if not out:
        raise SystemExit("nothing to copy: pass --player and/or --bots")
    return out


def copy_one(cur, uid, name, ctx):
    """Apply one player's ballot + play + swap for the episode. Returns a label."""
    n, src, tgt = ctx["n"], ctx["src"], ctx["tgt"]
    src_ep, tgt_ep = ctx["src_ep"], ctx["tgt_ep"]
    id2name, name2id = ctx["id2name"], ctx["name2id"]

    def to_tgt(cid):
        tid = name2id.get(id2name.get(cid))
        if not tid:
            raise SystemExit(f"{name}: no target contestant named {id2name.get(cid)!r}")
        return tid

    ballot = q(
        cur,
        "select contestant_id, rank from elimination_picks where user_id=%s"
        " and league_season_id=%s and episode_id=%s order by rank nulls first",
        [uid, src["id"], src_ep["id"]],
    )
    plays = q(
        cur,
        "select advantage_type, target_contestant_id from advantage_plays"
        " where user_id=%s and league_season_id=%s and episode_id=%s",
        [uid, src["id"], src_ep["id"]],
    )
    swaps = q(
        cur,
        "select rp.contestant_id new_cid, old.contestant_id old_cid"
        " from roster_picks rp join roster_picks old on old.id = rp.replaced_pick_id"
        " where rp.user_id=%s and rp.league_season_id=%s and rp.active_from_episode=%s"
        " and rp.replaced_pick_id is not null",
        [uid, src["id"], n],
    )
    if ctx["dry"]:
        return (
            f"{name}: {len(ballot)} picks, {len(plays)} play(s), {len(swaps)} swap(s)"
        )

    have = q(
        cur,
        "select 1 from elimination_picks"
        " where user_id=%s and league_season_id=%s and episode_id=%s",
        [uid, tgt["id"], tgt_ep["id"]],
    )
    if not have:
        for p in ballot:
            cur.execute(
                "insert into elimination_picks"
                " (user_id, league_season_id, episode_id, contestant_id, rank)"
                " values (%s,%s,%s,%s,%s) on conflict do nothing",
                [uid, tgt["id"], tgt_ep["id"], to_tgt(p["contestant_id"]), p["rank"]],
            )
    have_play = q(
        cur,
        "select 1 from advantage_plays"
        " where user_id=%s and league_season_id=%s and episode_id=%s",
        [uid, tgt["id"], tgt_ep["id"]],
    )
    if not have_play:
        for pl in plays:
            tc = (
                to_tgt(pl["target_contestant_id"])
                if pl["target_contestant_id"]
                else None
            )
            cur.execute(
                "insert into advantage_plays"
                " (user_id, league_season_id, episode_id, advantage_type,"
                " target_contestant_id, token_cost) values (%s,%s,%s,%s,%s,0)",
                [uid, tgt["id"], tgt_ep["id"], pl["advantage_type"], tc],
            )
    for s in swaps:
        apply_swap(cur, uid, name, tgt, n, to_tgt(s["old_cid"]), to_tgt(s["new_cid"]))
    skipped = " (had picks, skipped)" if have else ""
    return (
        f"{name}: {len(ballot)} picks{skipped}, "
        f"{len(plays)} play(s), {len(swaps)} swap(s)"
    )


def apply_swap(cur, uid, name, tgt, n, old_cid, new_cid):
    existing = q(
        cur,
        "select id from roster_picks where user_id=%s and league_season_id=%s"
        " and contestant_id=%s and active_until_episode is null"
        " and active_from_episode < %s",
        [uid, tgt["id"], old_cid, n],
    )
    if not existing:
        raise SystemExit(
            f"{name}: swap's outgoing pick isn't active on the target roster"
        )
    if q(
        cur,
        "select 1 from roster_picks where user_id=%s and league_season_id=%s"
        " and contestant_id=%s and active_from_episode=%s",
        [uid, tgt["id"], new_cid, n],
    ):
        return
    closed = q(
        cur,
        "select count(*) c from roster_picks where user_id=%s and league_season_id=%s"
        " and active_until_episode is not null",
        [uid, tgt["id"]],
    )[0]["c"]
    ordinal = closed + 1
    penalty = (
        0
        if ordinal <= tgt["free_swaps"]
        else max(tgt["swap_penalty_step"] * ordinal, tgt["swap_penalty_floor"])
    )
    cur.execute(
        "update roster_picks set active_until_episode=%s,"
        " swap_penalty_points=%s where id=%s",
        [n - 1, penalty, existing[0]["id"]],
    )
    cur.execute(
        "insert into roster_picks (user_id, league_season_id, contestant_id,"
        " active_from_episode, replaced_pick_id) values (%s,%s,%s,%s,%s)",
        [uid, tgt["id"], new_cid, n, existing[0]["id"]],
    )


def verify_one(cur, uid, ctx):
    """True if the target ballot + play match the source (by name)."""
    src, tgt, src_ep, tgt_ep = ctx["src"], ctx["tgt"], ctx["src_ep"], ctx["tgt_ep"]
    id2name = ctx["id2name"]
    tgt_id2name = {v: k for k, v in ctx["name2id"].items()}

    def ballot_set(lsid, eid, mapper):
        return {
            (mapper.get(p["contestant_id"]), p["rank"])
            for p in q(
                cur,
                "select contestant_id, rank from elimination_picks"
                " where user_id=%s and league_season_id=%s and episode_id=%s",
                [uid, lsid, eid],
            )
        }

    def play_set(lsid, eid, mapper):
        return {
            (p["advantage_type"], mapper.get(p["target_contestant_id"]))
            for p in q(
                cur,
                "select advantage_type, target_contestant_id from advantage_plays"
                " where user_id=%s and league_season_id=%s and episode_id=%s",
                [uid, lsid, eid],
            )
        }

    want = (
        ballot_set(src["id"], src_ep["id"], id2name),
        play_set(src["id"], src_ep["id"], id2name),
    )
    got = (
        ballot_set(tgt["id"], tgt_ep["id"], tgt_id2name),
        play_set(tgt["id"], tgt_ep["id"], tgt_id2name),
    )
    return want == got


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-league", required=True)
    ap.add_argument("--target-league", required=True)
    ap.add_argument("--episode", type=int, required=True)
    ap.add_argument("--player", help="one member to copy, by display name")
    ap.add_argument("--bots", action="store_true", help="copy every bot member")
    ap.add_argument("--source-season-number", type=int)
    ap.add_argument("--target-season-number", type=int)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    n = args.episode

    conn = connect()
    conn.autocommit = False
    cur = conn.cursor()

    src = resolve_ls(cur, args.source_league, args.source_season_number)
    tgt = resolve_ls(cur, args.target_league, args.target_season_number)
    src_ep = episode(cur, src["season_id"], n)
    tgt_ep = episode(cur, tgt["season_id"], n)
    id2name, _ = contestants(cur, src["season_id"])
    _, name2id = contestants(cur, tgt["season_id"])
    players = target_players(cur, tgt, args.player, args.bots)

    print(f"SOURCE {args.source_league}: {src['name']} ep{n} ({src_ep['status']})")
    print(
        f"TARGET {args.target_league}: {tgt['name']} ep{n} "
        f"({tgt_ep['status']}, lock={tgt_ep['picks_lock_at']})"
    )
    print(f"copying {len(players)} player(s): {', '.join(sorted(players.values()))}")

    if tgt_ep["status"] == "scored" or tgt_ep["picks_lock_at"] <= datetime.now(
        timezone.utc
    ):
        raise SystemExit(
            "Target episode is not open (locked/scored); copy picks before lock."
        )

    ctx = {
        "n": n,
        "src": src,
        "tgt": tgt,
        "src_ep": src_ep,
        "tgt_ep": tgt_ep,
        "id2name": id2name,
        "name2id": name2id,
        "dry": args.dry_run,
    }
    for uid, name in players.items():
        print("  " + copy_one(cur, uid, name, ctx))
    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return

    failed = [players[uid] for uid in players if not verify_one(cur, uid, ctx)]
    if failed:
        conn.rollback()
        print(f"VERIFY FAIL for {failed} — rolled back, nothing written.")
        sys.exit(1)
    conn.commit()
    print(f"VERIFY PASS — committed {len(players)} player(s).")


if __name__ == "__main__":
    main()
