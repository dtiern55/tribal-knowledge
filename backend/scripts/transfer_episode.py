"""Transfer one episode's scoring from a source league to a target league.

The "second ritual" (#737 follow-up): the secondary league runs ahead (bots +
the real scoring ritual); this copies an already-scored episode's result — the
show facts, which are the same for every league playing the season — into a
target league (qa) to catch it up. It is player-agnostic: it scores whatever
ballots already exist, and never touches a real player's picks.

Copies eliminations, scoring events, tiles, and headline/note, then closes the
episode out and VERIFIES the target now matches the source. Run --dry-run first.

    cd backend && uv run --env-file .env.prod python scripts/transfer_episode.py \
        --source-league secondary --target-league qa --episode 4 --dry-run
    # then drop --dry-run to apply

Contestants are matched by name (each league has its own season copy). The
target episode must be locked, so applying can't leak the result.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone


def http(method, url, token=None, body=None, apikey=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if apikey:
        headers["apikey"] = apikey
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r) if r.length != 0 else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:300]
        raise SystemExit(f"{method} {url} -> {e.code}: {detail}")


def resolve_league_season(api, tok, league, season_number):
    rows = [
        s
        for s in http("GET", f"{api}/league-seasons", tok)
        if s["league_name"] == league
    ]
    if season_number is not None:
        rows = [s for s in rows if s["season_number"] == season_number]
    if not rows:
        raise SystemExit(
            f"No league-season for league {league!r}"
            + (f" season {season_number}" if season_number else "")
        )
    if len(rows) > 1:
        opts = ", ".join(f"{s['name']} (season {s['season_number']})" for s in rows)
        raise SystemExit(
            f"League {league!r} has {len(rows)} seasons; pass "
            f"--source-season-number / --target-season-number. Options: {opts}"
        )
    return rows[0]


def episode(api, tok, season_id, n):
    eps = [
        e
        for e in http("GET", f"{api}/seasons/{season_id}/episodes", tok)
        if e["episode_number"] == n
    ]
    if not eps:
        raise SystemExit(f"Season {season_id} has no episode {n}")
    return eps[0]


def name_maps(api, tok, src_sid, tgt_sid):
    src = {
        c["id"]: c["name"] for c in http("GET", f"{api}/seasons/{src_sid}/cast", tok)
    }
    tgt = {
        c["name"]: c["id"] for c in http("GET", f"{api}/seasons/{tgt_sid}/cast", tok)
    }
    return src, tgt


def insight_payload(row):
    if row["insight_type"] == "manual_note":
        return {
            "insight_type": "manual_note",
            "label": row["label"],
            "value": row["value"],
            "detail": row["detail"],
        }
    keep = {"insight_type": row["insight_type"]}
    if row.get("contestant_id"):
        keep["contestant_id"] = row[
            "contestant_id"
        ]  # note: a per-contestant tile would need name mapping
    if row.get("advantage_type"):
        keep["advantage_type"] = row["advantage_type"]
    return keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source-league", required=True)
    ap.add_argument("--target-league", required=True)
    ap.add_argument("--episode", type=int, required=True)
    ap.add_argument("--source-season-number", type=int)
    ap.add_argument("--target-season-number", type=int)
    ap.add_argument("--api", default="https://tribal-knowledge-app.fly.dev")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--no-score", action="store_true", help="skip closing the episode out"
    )
    args = ap.parse_args()
    api, n = args.api, args.episode

    tok = http(
        "POST",
        f"{os.environ['SUPABASE_URL']}/auth/v1/token?grant_type=password",
        apikey=os.environ["SUPABASE_ANON_KEY"],
        body={
            "email": os.environ["PRODUCER_EMAIL"],
            "password": os.environ["PRODUCER_PASSWORD"],
        },
    )["access_token"]

    src_ls = resolve_league_season(
        api, tok, args.source_league, args.source_season_number
    )
    tgt_ls = resolve_league_season(
        api, tok, args.target_league, args.target_season_number
    )
    src_sid, tgt_sid = src_ls["season_id"], tgt_ls["season_id"]
    src_ep = episode(api, tok, src_sid, n)
    tgt_ep = episode(api, tok, tgt_sid, n)
    src2name, name2tgt = name_maps(api, tok, src_sid, tgt_sid)

    print(f"SOURCE {args.source_league}: {src_ls['name']} ep{n} ({src_ep['status']})")
    print(
        f"TARGET {args.target_league}: {tgt_ls['name']} ep{n} "
        f"({tgt_ep['status']}, lock={tgt_ep['picks_lock_at']})"
    )

    locked = tgt_ep["status"] == "scored" or datetime.fromisoformat(
        tgt_ep["picks_lock_at"]
    ) <= datetime.now(timezone.utc)
    if not locked:
        raise SystemExit(
            "Target episode isn't locked; refusing so a write can't leak the result."
        )
    if src_ep["status"] != "scored":
        print("WARNING: source episode is not scored — its result may be incomplete.")

    # --- build the target payloads from the source, mapped by name ---
    def to_tgt(cid):
        return name2tgt.get(src2name.get(cid))

    src_elim = http("GET", f"{api}/episodes/{src_ep['id']}/eliminations", tok)
    src_ev = http("GET", f"{api}/episodes/{src_ep['id']}/scoring-events", tok)
    src_ins = sorted(
        http("GET", f"{api}/episodes/{src_ep['id']}/insights", tok),
        key=lambda x: x["display_order"],
    )
    enabled = {
        t["event_type"]
        for t in http("GET", f"{api}/seasons/{tgt_sid}/scoring-event-types", tok)
    }

    problems, elim_body, ev_body = [], [], []
    for x in src_elim:
        tid = to_tgt(x["contestant_id"])
        (
            elim_body.append(
                {
                    "contestant_id": tid,
                    "elimination_type": x["elimination_type"],
                    "is_final": x["is_final"],
                }
            )
            if tid
            else problems.append(
                f"no target contestant for {src2name.get(x['contestant_id'])!r}"
            )
        )
    for x in src_ev:
        tid, et = to_tgt(x["contestant_id"]), x["event_type"]
        if not tid:
            problems.append(
                f"no target contestant for {src2name.get(x['contestant_id'])!r}"
            )
        elif et not in enabled:
            problems.append(f"event type not enabled in target: {et}")
        else:
            ev_body.append(
                {
                    "contestant_id": tid,
                    "event_type": et,
                    "quantity": x.get("quantity", 1),
                    "notes": f"transfer: {args.source_league} ep{n}",
                }
            )
    ins_body = [insight_payload(r) for r in src_ins]

    close = "" if args.no_score else ", then close out (score)"
    print(
        f"\nPlan: {len(elim_body)} eliminations, {len(ev_body)} events, "
        f"{len(ins_body)} tiles{close}."
    )
    print(
        "headline:", repr(src_ep.get("headline")), "| note:", repr(src_ep.get("note"))
    )
    if problems:
        raise SystemExit("PROBLEMS (nothing written):\n  - " + "\n  - ".join(problems))
    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return

    # --- apply (additive; dedup against what's already there) ---
    have_elim = {
        (e["contestant_id"], e["elimination_type"])
        for e in http("GET", f"{api}/episodes/{tgt_ep['id']}/eliminations", tok)
    }
    have_ev = {
        (e["contestant_id"], e["event_type"])
        for e in http("GET", f"{api}/episodes/{tgt_ep['id']}/scoring-events", tok)
    }
    elim_new = [
        e
        for e in elim_body
        if (e["contestant_id"], e["elimination_type"]) not in have_elim
    ]
    ev_new = [
        e for e in ev_body if (e["contestant_id"], e["event_type"]) not in have_ev
    ]
    if elim_new:
        http("POST", f"{api}/episodes/{tgt_ep['id']}/eliminations", tok, elim_new)
    if ev_new:
        http("POST", f"{api}/episodes/{tgt_ep['id']}/scoring-events", tok, ev_new)
    if ins_body:
        http("PUT", f"{api}/episodes/{tgt_ep['id']}/insights", tok, ins_body)
    if src_ep.get("headline") or src_ep.get("note"):
        http(
            "PATCH",
            f"{api}/episodes/{tgt_ep['id']}",
            tok,
            {k: src_ep[k] for k in ("headline", "note") if src_ep.get(k)},
        )
    if not args.no_score and tgt_ep["status"] != "scored":
        http("POST", f"{api}/episodes/{tgt_ep['id']}/score", tok, {})
    print(
        f"Applied: +{len(elim_new)} eliminations, +{len(ev_new)} events, "
        f"{len(ins_body)} tiles."
    )

    # --- VERIFY: the target episode now matches the source (by name) ---
    verify(api, tok, src_ep, tgt_ep, src2name, name2tgt, src_elim, src_ev, src_ins)


def verify(api, tok, src_ep, tgt_ep, src2name, name2tgt, src_elim, src_ev, src_ins):
    tgt2name = {v: k for k, v in name2tgt.items()}
    want_elim = {
        (src2name[e["contestant_id"]], e["elimination_type"]) for e in src_elim
    }
    want_ev = {
        (src2name[e["contestant_id"]], e["event_type"], e.get("quantity", 1))
        for e in src_ev
    }
    want_ins = {(r["insight_type"], r["label"]) for r in src_ins}

    got = http("GET", f"{api}/episodes/{tgt_ep['id']}/eliminations", tok)
    got_elim = {(tgt2name.get(e["contestant_id"]), e["elimination_type"]) for e in got}
    got = http("GET", f"{api}/episodes/{tgt_ep['id']}/scoring-events", tok)
    got_ev = {
        (tgt2name.get(e["contestant_id"]), e["event_type"], e.get("quantity", 1))
        for e in got
    }
    got_ins = {
        (r["insight_type"], r["label"])
        for r in http("GET", f"{api}/episodes/{tgt_ep['id']}/insights", tok)
    }

    ok = True
    for label, want, gotset in [
        ("eliminations", want_elim, got_elim),
        ("events", want_ev, got_ev),
        ("tiles", want_ins, got_ins),
    ]:
        missing, extra = want - gotset, gotset - want
        status = "OK" if not missing and not extra else "MISMATCH"
        ok = ok and status == "OK"
        print(
            f"  verify {label}: {status}"
            + (
                f" missing={sorted(missing)} extra={sorted(extra)}"
                if status != "OK"
                else f" ({len(want)} match)"
            )
        )
    final = http("GET", f"{api}/seasons/{tgt_ep['season_id']}/episodes", tok)
    scored = next(e for e in final if e["id"] == tgt_ep["id"])["status"]
    print(f"  verify status: {scored}")
    print("VERIFY " + ("PASS" if ok else "FAIL"))
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
