"""Copy one player's picks for an episode from a source league to a target
league — the pre-lock companion to transfer_episode.py (#737).

The secondary league runs ahead; this mirrors Danny's own play (ballot +
advantage play + a roster swap that episode) into the qa league so he doesn't
re-enter it by hand. It writes ONLY that player's rows, straight to the DB like
run_bots.py (one transaction, one commit). The target episode must be OPEN, so
this is a normal pre-lock ballot, not a post-lock insert.

    cd backend && uv run --env-file .env.prod python scripts/copy_player_picks.py \
        --source-league secondary --target-league qa --episode 5 \
        --player "Danny Fairplay" --dry-run
    # looks right? drop --dry-run.

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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-league", required=True)
    ap.add_argument("--target-league", required=True)
    ap.add_argument("--episode", type=int, required=True)
    ap.add_argument(
        "--player", required=True, help="player display name, e.g. 'Danny Fairplay'"
    )
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
    src_id2name, _ = contestants(cur, src["season_id"])
    _, tgt_name2id = contestants(cur, tgt["season_id"])

    players = q(
        cur,
        "select p.id from profiles p join league_members m on m.user_id = p.id"
        " where p.display_name = %s and m.league_id = %s",
        [args.player, tgt["league_id"]],
    )
    if len(players) != 1:
        raise SystemExit(
            f"{args.player!r} matched {len(players)} members of target league"
        )
    uid = players[0]["id"]
    if not q(
        cur,
        "select 1 from league_members where user_id = %s and league_id = %s",
        [uid, src["league_id"]],
    ):
        raise SystemExit(
            f"{args.player!r} is not a member of source league {args.source_league!r}"
        )

    print(f"SOURCE {args.source_league}: {src['name']} ep{n} ({src_ep['status']})")
    print(
        f"TARGET {args.target_league}: {tgt['name']} ep{n} "
        f"({tgt_ep['status']}, lock={tgt_ep['picks_lock_at']})"
    )
    print(f"player {args.player}: {uid}")

    if tgt_ep["status"] == "scored" or tgt_ep["picks_lock_at"] <= datetime.now(
        timezone.utc
    ):
        raise SystemExit(
            "Target episode is not open (locked/scored); copy picks before lock."
        )

    def to_tgt(cid):
        name = src_id2name.get(cid)
        tid = tgt_name2id.get(name)
        if not tid:
            raise SystemExit(f"no target contestant named {name!r}")
        return tid, name

    # --- read source play ---
    src_ballot = q(
        cur,
        "select contestant_id, rank from elimination_picks"
        " where user_id=%s and league_season_id=%s and episode_id=%s"
        " order by rank nulls first",
        [uid, src["id"], src_ep["id"]],
    )
    src_plays = q(
        cur,
        "select advantage_type, target_contestant_id from advantage_plays"
        " where user_id=%s and league_season_id=%s and episode_id=%s",
        [uid, src["id"], src_ep["id"]],
    )
    src_swaps = q(
        cur,
        "select rp.contestant_id new_cid, old.contestant_id old_cid"
        " from roster_picks rp join roster_picks old on old.id = rp.replaced_pick_id"
        " where rp.user_id=%s and rp.league_season_id=%s and rp.active_from_episode=%s"
        " and rp.replaced_pick_id is not null",
        [uid, src["id"], n],
    )

    # --- idempotency: what's already on the target ---
    have_ballot = q(
        cur,
        "select 1 from elimination_picks"
        " where user_id=%s and league_season_id=%s and episode_id=%s",
        [uid, tgt["id"], tgt_ep["id"]],
    )
    have_play = q(
        cur,
        "select 1 from advantage_plays"
        " where user_id=%s and league_season_id=%s and episode_id=%s",
        [uid, tgt["id"], tgt_ep["id"]],
    )

    ballot_rows = [(to_tgt(p["contestant_id"])[0], p["rank"]) for p in src_ballot]
    play_rows = [
        (
            pl["advantage_type"],
            (
                to_tgt(pl["target_contestant_id"])[0]
                if pl["target_contestant_id"]
                else None
            ),
        )
        for pl in src_plays
    ]

    print(
        f"\nPlan: {len(ballot_rows)} ballot picks, {len(play_rows)} play(s),"
        f" {len(src_swaps)} swap(s)."
    )
    if have_ballot:
        print("  ballot: target already has picks — will skip.")
    if have_play and play_rows:
        print("  play: target already has a play — will skip.")

    if args.dry_run:
        for p in src_ballot:
            nm = src_id2name.get(p["contestant_id"])
            print(f"    pick r{p['rank']}: {nm}")
        for at, tc in play_rows:
            print(
                f"    play: {at}"
                + (
                    f" -> {src_id2name.get(src_plays[0]['target_contestant_id'])}"
                    if tc
                    else ""
                )
            )
        for s in src_swaps:
            out, inn = src_id2name.get(s["old_cid"]), src_id2name.get(s["new_cid"])
            print(f"    swap: out {out} / in {inn}")
        print("--dry-run: nothing written.")
        return

    # --- write (skip what's already there) ---
    if not have_ballot:
        for cid, rank in ballot_rows:
            cur.execute(
                "insert into elimination_picks"
                " (user_id, league_season_id, episode_id, contestant_id, rank)"
                " values (%s,%s,%s,%s,%s) on conflict do nothing",
                [uid, tgt["id"], tgt_ep["id"], cid, rank],
            )
    if play_rows and not have_play:
        for at, tc in play_rows:
            cur.execute(
                "insert into advantage_plays"
                " (user_id, league_season_id, episode_id, advantage_type,"
                " target_contestant_id, token_cost) values (%s,%s,%s,%s,%s,0)",
                [uid, tgt["id"], tgt_ep["id"], at, tc],
            )
    for s in src_swaps:
        apply_swap(cur, uid, tgt, n, to_tgt(s["old_cid"]), to_tgt(s["new_cid"]))

    verify(cur, uid, src, tgt, src_ep, tgt_ep, n, src_id2name, tgt_name2id)
    conn.commit()
    print("committed.")


def apply_swap(cur, uid, tgt, n, old, new):
    old_cid, old_name = old
    new_cid, new_name = new
    existing = q(
        cur,
        "select id, active_from_episode from roster_picks where user_id=%s"
        " and league_season_id=%s and contestant_id=%s and active_until_episode is null"
        " and active_from_episode < %s",
        [uid, tgt["id"], old_cid, n],
    )
    if not existing:
        raise SystemExit(
            f"swap: {old_name!r} is not active on the target roster before ep{n}"
        )
    if q(
        cur,
        "select 1 from roster_picks where user_id=%s and league_season_id=%s"
        " and contestant_id=%s and active_from_episode=%s",
        [uid, tgt["id"], new_cid, n],
    ):
        print(f"  swap {old_name}->{new_name}: already applied, skipping.")
        return
    closed = q(
        cur,
        "select count(*) c from roster_picks where user_id=%s"
        " and league_season_id=%s and active_until_episode is not null",
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
    print(f"  swap {old_name}->{new_name}: penalty {penalty}")


def verify(cur, uid, src, tgt, src_ep, tgt_ep, n, src_id2name, tgt_name2id):
    tgt_id2name = {v: k for k, v in tgt_name2id.items()}
    want_ballot = {
        (src_id2name[p["contestant_id"]], p["rank"])
        for p in q(
            cur,
            "select contestant_id, rank from elimination_picks where user_id=%s"
            " and league_season_id=%s and episode_id=%s",
            [uid, src["id"], src_ep["id"]],
        )
    }
    got_ballot = {
        (tgt_id2name.get(p["contestant_id"]), p["rank"])
        for p in q(
            cur,
            "select contestant_id, rank from elimination_picks where user_id=%s"
            " and league_season_id=%s and episode_id=%s",
            [uid, tgt["id"], tgt_ep["id"]],
        )
    }
    want_play = {
        (p["advantage_type"], src_id2name.get(p["target_contestant_id"]))
        for p in q(
            cur,
            "select advantage_type, target_contestant_id from advantage_plays"
            " where user_id=%s and league_season_id=%s and episode_id=%s",
            [uid, src["id"], src_ep["id"]],
        )
    }
    got_play = {
        (p["advantage_type"], tgt_id2name.get(p["target_contestant_id"]))
        for p in q(
            cur,
            "select advantage_type, target_contestant_id from advantage_plays"
            " where user_id=%s and league_season_id=%s and episode_id=%s",
            [uid, tgt["id"], tgt_ep["id"]],
        )
    }

    ok = True
    for label, want, got in [
        ("ballot", want_ballot, got_ballot),
        ("play", want_play, got_play),
    ]:
        miss, extra = want - got, got - want
        status = "OK" if not miss and not extra else "MISMATCH"
        ok = ok and status == "OK"
        print(
            f"  verify {label}: {status}"
            + ("" if ok else f" missing={sorted(miss)} extra={sorted(extra)}")
        )
    print("VERIFY " + ("PASS" if ok else "FAIL"))
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
