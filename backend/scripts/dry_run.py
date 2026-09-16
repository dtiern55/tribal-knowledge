"""Dry-run a season on staging: random bots, random outcomes, one week at a time.

The pre-launch rehearsal for a real season (S51, 2026-09-16): every lock, the
reveal, the first-loss and Sole Survivor moments, the finale, all driven on the
"Practice:" copy of the season with the 18 bots playing at random and the
commissioner (Danny) playing for real. Nothing here knows or uses the real
show's outcomes — boots and events are drawn from a seeded RNG.

Episode facts go through the admin API with the producer login, the same path
the weekly ritual uses, so the run rehearses that too. Bot picks reuse
run_bots.py with a read that names nobody (spread 100 = a uniform shuffle).

Usage (from backend/, staging only — reads .env):
    PYTHONPATH=. uv run python scripts/dry_run.py setup      # 13 episodes, 2 tribes
    PYTHONPATH=. uv run python scripts/dry_run.py status
    PYTHONPATH=. uv run python scripts/dry_run.py bots N     # bots pick and play for N
    PYTHONPATH=. uv run python scripts/dry_run.py air N [--boot NAME ...] [--boots K]
    PYTHONPATH=. uv run python scripts/dry_run.py reset --yes   # wipe + recopy fresh

A week is: `bots N` while N is open → Danny plays on the preview → `air N`
locks N, draws the outcome, writes it, scores it. Pause between commands to
look at whatever the moment is.

Or play it all through once (`seed`) and move around it afterwards: `jump N`
(or the Admin page's Dry run control) scores everything before N and reopens
N onwards, so any week is a click away (app/routers/dry_run.py).
"""

import argparse
import math
import os
import random
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from dotenv import dotenv_values

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.routers.roster import effective_swap_lock  # noqa: E402
from app.tribe_import import MERGE_COLOR  # noqa: E402
from scripts import run_bots  # noqa: E402
from scripts.import_episode import login  # noqa: E402
from scripts.stage_staging import FROZEN  # noqa: E402

LEAGUE = "Practice: Survivor 51"
SEASON = 51
EPISODES = 13
API = "https://tribal-knowledge-staging.fly.dev"
DANNY = "dannyjtierney@gmail.com"
# Two large starting tribes (the season's likely shape), invented names.
TRIBES = [("Lava", "#dc2626"), ("Reef", "#2563eb")]
MERGE_TRIBE = ("Ora", MERGE_COLOR)
MERGE_AT = 13  # alive going into an episode ≤ this → that episode is the merge
FINALISTS = 5  # alive going into the finale: F5 → F4 → fire → F3
JURY_FROM = 10  # alive after a post-merge boot ≤ this → the boot joins the jury

# A read that names nobody: draft, votes and doubles come out of a uniform
# shuffle. Every episode needs an entry (an empty one is refused), so the note
# is the entry.
RANDOM_READ = {
    "spread": 100,
    "episodes": {str(n): {"note": "dry run: random"} for n in range(1, EPISODES + 1)},
}


def api() -> httpx.Client:
    if API.rstrip("/").endswith("tribal-knowledge-app.fly.dev"):
        sys.exit("refusing to dry-run against the production API")
    prod = dotenv_values(".env.prod")
    if prod and prod.get("DB_HOST") == os.environ.get("DB_HOST"):
        sys.exit(".env points at the prod database; refusing")
    client = httpx.Client(base_url=API, timeout=60)
    client.headers["Authorization"] = f"Bearer {login(client)}"
    return client


def call(client, method, path, **kw):
    r = client.request(method, path, **kw)
    if r.is_error:
        sys.exit(f"{method} {path} → {r.status_code}: {r.text}")
    return r.json() if r.content else None


def season_and_league(cur):
    """The practice league-season (refused unless the bots are in it)."""
    return run_bots.league_season(cur, LEAGUE, SEASON)


def episodes(cur, sid) -> list[dict]:
    cur.execute(
        "select * from episodes where season_id=%s order by episode_number", [sid]
    )
    return cur.fetchall()


def names(cur, sid) -> dict[str, str]:
    cur.execute(
        "select id::text cid, coalesce(nickname, name) n from contestants"
        " where season_id=%s",
        [sid],
    )
    return {r["cid"]: r["n"] for r in cur.fetchall()}


def tribe_of(cur, sid, episode_n) -> dict[str, str]:
    """contestant id → tribe name as of `episode_n` (latest from_episode ≤ N)."""
    cur.execute(
        """
        select distinct on (ct.contestant_id) ct.contestant_id::text cid, t.name
        from contestant_tribes ct join tribes t on t.id = ct.tribe_id
        where t.season_id=%s and ct.from_episode <= %s
        order by ct.contestant_id, ct.from_episode desc
        """,
        [sid, episode_n],
    )
    return {r["cid"]: r["name"] for r in cur.fetchall()}


def merged(cur, sid) -> bool:
    cur.execute("select 1 from tribes where season_id=%s and is_merge", [sid])
    return cur.fetchone() is not None


def danny_roster(cur, lsid) -> list[dict]:
    cur.execute(
        """
        select rp.contestant_id::text cid, rp.is_sole_survivor ss
        from roster_picks rp join auth.users u on u.id = rp.user_id
        where u.email=%s and rp.league_season_id=%s and rp.active_until_episode is null
        """,
        [DANNY, lsid],
    )
    return cur.fetchall()


# ── setup ──────────────────────────────────────────────────────────────────


def setup(cur):
    ls = season_and_league(cur)
    sid = str(ls["season_id"])
    client = api()
    have = {e["episode_number"] for e in episodes(cur, sid)}
    for n in range(1, EPISODES + 1):
        if n in have:
            continue
        lock = FROZEN + timedelta(weeks=n - 1)
        call(
            client,
            "POST",
            f"/seasons/{sid}/episodes",
            json={
                "episode_number": n,
                "air_date": lock.date().isoformat(),
                "is_finale": n == EPISODES,
                "picks_lock_at": lock.isoformat(),
            },
        )
        print(f"  episode {n} created{' (finale)' if n == EPISODES else ''}")

    cur.execute("select count(*) n from tribes where season_id=%s", [sid])
    if cur.fetchone()["n"] == 0:
        cast = list(names(cur, sid))
        random.Random(f"{sid}:tribes").shuffle(cast)
        half = math.ceil(len(cast) / 2)
        for (name, color), members in zip(TRIBES, (cast[:half], cast[half:])):
            cur.execute(
                "insert into tribes (season_id, name, color, is_merge)"
                " values (%s,%s,%s,false) returning id",
                [sid, name, color],
            )
            tid = cur.fetchone()["id"]
            for cid in members:
                cur.execute(
                    "insert into contestant_tribes"
                    " (contestant_id, tribe_id, from_episode) values (%s,%s,1)",
                    [cid, tid],
                )
            print(f"  tribe {name}: {len(members)}")
    print(f"setup: {LEAGUE} has {EPISODES} episodes and 2 tribes")


# ── bots ───────────────────────────────────────────────────────────────────


def bots(cur, n: int):
    run_bots.load_read = lambda season: RANDOM_READ
    ls = season_and_league(cur)
    ep = next(
        e for e in episodes(cur, str(ls["season_id"])) if e["episode_number"] == n
    )
    if n == (ls["roster_lock_episode"] or 1):
        run_bots.draft(cur, LEAGUE, SEASON)
    if ep["is_finale"]:
        # The finale's ballot is the bracket; the weekly ballot and the
        # advantage are both shut, so `week` has nothing to do here.
        run_bots.ballot(cur, LEAGUE, SEASON)
    else:
        run_bots.week(cur, n, LEAGUE, SEASON)


# ── air ────────────────────────────────────────────────────────────────────


def air(cur, n: int, boot_names: list[str], boots_k: int | None):
    ls = season_and_league(cur)
    sid, lsid = str(ls["season_id"]), str(ls["id"])
    eps = episodes(cur, sid)
    ep = next((e for e in eps if e["episode_number"] == n), None) or sys.exit(
        f"no episode {n}"
    )
    if ep["status"] == "scored":
        sys.exit(f"episode {n} is already scored")
    run_bots.require_history_scored(cur, sid, n)
    rng = random.Random(f"{sid}:air:{n}")
    who = names(cur, sid)
    alive = sorted(run_bots.alive_ids(cur, sid))
    client = api()

    # Lock first: the API refuses to score an open episode, and this is the
    # moment the Locked page takes over on the preview.
    call(
        client,
        "PATCH",
        f"/episodes/{ep['id']}",
        json={
            "picks_lock_at": (
                datetime.now(timezone.utc) - timedelta(minutes=1)
            ).isoformat()
        },
    )

    # The merge: the first episode that opens with MERGE_AT or fewer alive.
    is_merge = n > 1 and not merged(cur, sid) and len(alive) <= MERGE_AT
    if is_merge:
        cur.execute(
            "insert into tribes (season_id, name, color, is_merge)"
            " values (%s,%s,%s,true) returning id",
            [sid, *MERGE_TRIBE],
        )
        tid = cur.fetchone()["id"]
        for cid in alive:
            cur.execute(
                "insert into contestant_tribes (contestant_id, tribe_id, from_episode)"
                " values (%s,%s,%s)",
                [cid, tid, n],
            )
        call(client, "PATCH", f"/seasons/{sid}", json={"merge_episode": n})
    post_merge = is_merge or merged(cur, sid)
    tribes = tribe_of(cur, sid, n)

    # ── who goes ──
    if boot_names:
        boots = run_bots.resolve(cur, sid, boot_names, "--boot")
        dead = [c for c in boots if c not in alive]
        if dead:
            sys.exit(f"already out: {[who[c] for c in dead]}")
    elif ep["is_finale"]:
        boots = rng.sample(alive, 2)
    else:
        left = sum(1 for e in eps if e["status"] != "scored" and not e["is_finale"])
        k = boots_k or max(1, math.ceil((len(alive) - FINALISTS) / left))
        if post_merge:
            boots = rng.sample(alive, k)
        else:
            # One tribal per boot: the losing tribe(s) each send someone home.
            by_tribe = {}
            for c in alive:
                by_tribe.setdefault(tribes.get(c, "?"), []).append(c)
            losers = rng.sample(sorted(by_tribe), min(k, len(by_tribe)))
            boots = [rng.choice(by_tribe[t]) for t in losers]
            while len(boots) < k:
                boots.append(rng.choice([c for c in alive if c not in boots]))
    survivors = [c for c in alive if c not in boots]

    elims = [
        {
            "contestant_id": c,
            "elimination_type": (
                "fire_making_loss" if ep["is_finale"] and i == 1 else "voted_out"
            ),
            "is_final": True,
        }
        for i, c in enumerate(boots)
    ]
    call(client, "POST", f"/episodes/{ep['id']}/eliminations", json=elims)

    # ── what happened ── (the premiere is watch-only: boots only, no events)
    events = []

    def ev(cid, event_type, quantity=1):
        events.append(
            {"contestant_id": cid, "event_type": event_type, "quantity": quantity}
        )

    def tribal(voters, boot):
        """One vote: most voters get it right, the boot eats their votes, the
        strays land on one other name."""
        right = [v for v in voters if rng.random() < 0.7] or voters[:1]
        for v in right:
            ev(v, "vote_correctly_at_tribal")
        ev(boot, "votes_received", len(right))
        strays = len(voters) - len(right)
        if strays and len(voters) > 1:
            ev(rng.choice([v for v in voters if v != boot]), "votes_received", strays)

    if n > 1 and ep["is_finale"]:
        f5 = alive
        ev(rng.choice([c for c in f5 if c != boots[0]]), "win_individual_immunity")
        tribal([c for c in f5 if c != boots[0]], boots[0])
        ev(rng.choice(survivors), "win_fire_making_challenge")
        for c in boots:
            ev(c, "join_jury")
        for place, c in enumerate(rng.sample(survivors, 3), start=1):
            call(client, "PATCH", f"/contestants/{c}", json={"placement": place})
    elif n > 1 and post_merge:
        ev(rng.choice(survivors), "win_individual_immunity")
        if rng.random() < 0.6:
            ev(rng.choice(survivors), "win_individual_reward")
        for b in boots:
            tribal([c for c in alive if c != b], b)
            if len(survivors) <= JURY_FROM:
                ev(b, "join_jury")
    elif n > 1:
        losing = {tribes.get(b) for b in boots}
        for t in sorted({tribes.get(c) for c in alive} - losing):
            for c in [c for c in alive if tribes.get(c) == t]:
                ev(c, "win_team_immunity")
                if rng.random() < 0.5:
                    ev(c, "win_team_reward")
        for b in boots:
            tribal([c for c in alive if tribes.get(c) == tribes.get(b) and c != b], b)
    if n > 1 and not ep["is_finale"]:
        if rng.random() < 0.3:
            ev(rng.choice(survivors), "acquire_active_idol")
        if rng.random() < 0.2:
            ev(rng.choice(survivors), "go_on_journey")
        if rng.random() < 0.1:
            ev(rng.choice(survivors), "play_idol")
    if events:
        call(client, "POST", f"/episodes/{ep['id']}/scoring-events", json=events)

    # The two standing tiles (air-episode skill, 2026-09-09); the League Call
    # lead is automatic. Not on the premiere: it has no ballots and no reveal.
    if n >= (ls["roster_lock_episode"] or 1):
        tiles = [{"insight_type": "performance_vs_median"}]
        if len(boots) > 1 and not ep["is_finale"]:
            tiles.append({"insight_type": "multiple_correct_ballots"})
        call(client, "PUT", f"/episodes/{ep['id']}/insights", json=tiles)

    call(client, "POST", f"/episodes/{ep['id']}/score")

    # ── report ──
    print(f"episode {n} aired and scored:")
    if is_merge:
        print(f"  MERGE — {len(alive)} into {MERGE_TRIBE[0]}, merge_episode = {n}")
    for e in elims:
        c = e["contestant_id"]
        print(f"  out: {who[c]} ({tribes.get(c, '?')}, {e['elimination_type']})")
    print(f"  {len(events)} scoring events, {len(survivors)} still in")
    if ep["is_finale"]:
        cur.execute(
            "select coalesce(nickname, name) n, placement from contestants"
            " where season_id=%s and placement <= 3 order by placement",
            [sid],
        )
        print("  " + ", ".join(f"{r['placement']}. {r['n']}" for r in cur.fetchall()))
    lost = [r for r in danny_roster(cur, lsid) if r["cid"] in boots]
    for r in lost:
        print(
            f"  DANNY LOST {who[r['cid']]}"
            + (" — his Sole Survivor" if r["ss"] else "")
        )
    swap_lock = effective_swap_lock(ls)
    if n + 1 == swap_lock - 1:
        print(f"  next: episode {n + 1} opens the Sole Survivor designation")
    if n + 1 == swap_lock:
        print(
            f"  next: swaps and the Sole Survivor pick are locked from episode {n + 1}"
        )
    if n + 1 == EPISODES:
        print("  next: the finale is open — bracket ballot")


# ── seed / jump ────────────────────────────────────────────────────────────


def seed(cur, conn):
    """Play the whole season through, committing after every step."""
    ls = season_and_league(cur)
    for ep in episodes(cur, str(ls["season_id"])):
        n = ep["episode_number"]
        if ep["status"] == "scored":
            continue
        if n >= (ls["roster_lock_episode"] or 1):
            bots(cur, n)
            conn.commit()
        air(cur, n, [], None)
        conn.commit()


def jump(cur, target: str, locked: bool):
    ls = season_and_league(cur)
    body = (
        {"complete": True}
        if target == "complete"
        else {"episode": int(target), "locked": locked}
    )
    call(api(), "POST", f"/seasons/{ls['season_id']}/jump", json=body)


# ── status / reset ─────────────────────────────────────────────────────────


def status(cur):
    ls = season_and_league(cur)
    sid, lsid = str(ls["season_id"]), str(ls["id"])
    who = names(cur, sid)
    now = datetime.now(timezone.utc)
    cur.execute(
        "select e.episode_number n, array_agg(el.contestant_id::text) boots"
        " from episodes e join eliminations el on el.episode_id = e.id"
        " where e.season_id=%s group by 1",
        [sid],
    )
    boots = {r["n"]: r["boots"] for r in cur.fetchall()}
    print(
        f"{ls['name']} — merge_episode={ls['merge_episode']},"
        f" swap lock={effective_swap_lock(ls)}"
    )
    for e in episodes(cur, sid):
        state = e["status"]
        if state != "scored":
            state = "LOCKED (airing)" if e["picks_lock_at"] <= now else "open"
        out = ", ".join(who[c] for c in boots.get(e["episode_number"], []))
        print(f"  ep{e['episode_number']:>2} {state:<16} {out}")
    alive = run_bots.alive_ids(cur, sid)
    print(f"  {len(alive)} alive")
    roster = danny_roster(cur, lsid)
    if roster:
        print(
            "  Danny: "
            + ", ".join(
                who[r["cid"]]
                + (" ★" if r["ss"] else "")
                + ("" if r["cid"] in alive else " ✝")
                for r in roster
            )
        )


def reset(cur):
    """Wipe the practice season and league, then recopy fresh from prod."""
    cur.execute("select id from leagues where name=%s", [LEAGUE])
    league = cur.fetchone()
    if league:
        # league_seasons first: advantage_plays.target_contestant_id is NO ACTION.
        cur.execute("delete from league_seasons where league_id=%s", [league["id"]])
        cur.execute("delete from seasons where season_number=%s", [SEASON])
        cur.execute("delete from leagues where id=%s", [league["id"]])
        print(f"deleted {LEAGUE} and season {SEASON}")


def recopy():
    py = [sys.executable]
    subprocess.run(
        py
        + [
            "scripts/copy_season_to_staging.py",
            str(SEASON),
            "--league",
            "Snakes and Rats",
            "--name",
            LEAGUE,
            "--fresh",
            "--apply",
        ],
        check=True,
    )
    subprocess.run(
        py + ["scripts/run_bots.py", "setup", "--league", LEAGUE], check=True
    )


def main():
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "cmd", choices=["setup", "status", "bots", "air", "seed", "jump", "reset"]
    )
    p.add_argument("episode", nargs="?", help="episode number, or `complete` for jump")
    p.add_argument("--boot", action="append", default=[], help="name someone to go")
    p.add_argument(
        "--boots", type=int, help="how many go (default: what the math needs)"
    )
    p.add_argument("--locked", action="store_true", help="jump: land after the lock")
    p.add_argument("--yes", action="store_true", help="required by reset")
    a = p.parse_args()
    if a.cmd in ("bots", "air", "jump") and a.episode is None:
        p.error(f"{a.cmd} needs an episode number")
    if a.cmd == "reset" and not a.yes:
        p.error("reset wipes the practice season; add --yes")
    conn = run_bots.db()
    try:
        with conn.cursor() as cur:
            if a.cmd == "setup":
                setup(cur)
            elif a.cmd == "status":
                status(cur)
            elif a.cmd == "bots":
                bots(cur, int(a.episode))
            elif a.cmd == "air":
                air(cur, int(a.episode), a.boot, a.boots)
            elif a.cmd == "seed":
                seed(cur, conn)
            elif a.cmd == "jump":
                jump(cur, a.episode, a.locked)
                status(cur)
            elif a.cmd == "reset":
                reset(cur)
        conn.commit()
    finally:
        conn.close()
    if a.cmd == "reset":
        recopy()


if __name__ == "__main__":
    main()
