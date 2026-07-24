"""Practice-league bot driver (see design/bot-personas.md).

Twenty outcome-scripted bots calibrate the advantages: 5 Double-Roster, 5
Double-Vote, 5 Extra-Vote specialists + 5 generalists, one per skill tier
(100/80/60/40/20%). Skill = the rate at which a bot succeeds at whatever it
attempts (predicting the boot, doubling the true top scorer, landing the extra
pick). Bots get foresight (the known Cagayan results) — test instruments only.

Usage (against PROD, service role):
    uv run python scripts/run_bots.py setup       # accounts, labels, rosters
    uv run python scripts/run_bots.py play <N>    # simulate a *scored* episode

Writes directly to the DB with the service role, idempotent per episode.
"""

import hashlib
import os
import secrets
import sys

import httpx
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ENV = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(ENV)

SKILLS = [100, 80, 60, 40, 20]


def archetypes() -> list[dict]:
    """The 20 bots: (group, skill, display_name). Two flavor labels for UI edge
    cases (emoji, very long name) ride on generalist tiers."""
    out = []
    for group, label in [
        ("double_roster", "Roster×2"),
        ("double_vote", "Vote×2"),
        ("extra_vote", "Extra Vote"),
        ("generalist", "All-Rounder"),
    ]:
        for skill in SKILLS:
            name = f"{label} · {skill}%"
            if group == "generalist" and skill == 80:
                name += " 🔥"
            if group == "generalist" and skill == 20:
                # A near-max-length name (40-char limit) for UI wrap coverage.
                name = "All-Rounder · 20% — long-ish name test"
            out.append(
                {
                    "group": group,
                    "skill": skill,
                    "name": name,
                    "plays": (
                        ["double_roster", "double_vote", "extra_vote"]
                        if group == "generalist"
                        else [group]
                    ),
                }
            )
    return out


def rng(*parts) -> float:
    """Deterministic 0..1 from a stable seed — reproducible bot luck."""
    h = hashlib.sha256("·".join(str(p) for p in parts).encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def db():
    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=os.environ["DB_PORT"],
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def active_season(cur) -> dict:
    cur.execute(
        "select * from seasons where status = 'active' order by created_at desc limit 1"
    )
    s = cur.fetchone()
    if not s:
        sys.exit("No active season")
    return s


# ── setup ──────────────────────────────────────────────────────────────────


def create_bot_account(cur, http) -> str:
    """Mint a Supabase auth user for a bot + its profile; return the id."""
    r = http.post(
        f"{os.environ['SUPABASE_URL']}/auth/v1/admin/users",
        headers={
            "apikey": os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            "Authorization": f"Bearer {os.environ['SUPABASE_SERVICE_ROLE_KEY']}",
        },
        json={
            "email": f"bot-{secrets.token_hex(6)}@tribal.local",
            "password": secrets.token_urlsafe(24),
            "email_confirm": True,
        },
    )
    r.raise_for_status()
    uid = r.json()["id"]
    cur.execute(
        "insert into profiles (id, display_name, is_admin) values (%s, %s, false)"
        " on conflict (id) do nothing",
        [uid, "bot"],
    )
    return uid


def load_bots(cur) -> list[dict]:
    cur.execute(
        "select id, display_name from profiles"
        " where not is_admin and display_name <> 'Danny Fairplay'"
        " order by created_at"
    )
    return cur.fetchall()


def setup(cur, http):
    season = active_season(cur)
    arche = archetypes()
    # Adopt any bot auth users left profile-less by an earlier failed run
    # (accounts are created via the API, outside our transaction).
    cur.execute(
        "insert into profiles (id, display_name, is_admin)"
        " select u.id, 'bot', false from auth.users u"
        " left join profiles p on p.id = u.id"
        " where p.id is null and u.email like 'bot-%@tribal.local'"
    )
    bots = load_bots(cur)
    while len(bots) < len(arche):
        create_bot_account(cur, http)
        bots = load_bots(cur)

    lock_ep = season["roster_lock_episode"] or 1
    cur.execute("select id from contestants where season_id = %s", [season["id"]])
    all_ids = [r["id"] for r in cur.fetchall()]
    # castaways still in the game after the last scored episode
    cur.execute(
        """select c.id from contestants c
                   where c.season_id = %s and not exists (
                     select 1 from eliminations e where e.contestant_id = c.id)""",
        [season["id"]],
    )
    alive = [r["id"] for r in cur.fetchall()]

    for a, bot in zip(arche, bots):
        cur.execute(
            "update profiles set display_name = %s where id = %s",
            [a["name"], bot["id"]],
        )
        cur.execute(
            "select count(*) n from roster_picks where user_id = %s and season_id = %s",
            [bot["id"], season["id"]],
        )
        if cur.fetchone()["n"] == 0:
            pool = sorted(alive or all_ids, key=lambda cid: rng(bot["id"], cid))[
                : season["roster_size"]
            ]
            for cid in pool:
                cur.execute(
                    """insert into roster_picks
                    (user_id, season_id, contestant_id, active_from_episode,
                     swap_penalty_points)
                    values (%s, %s, %s, %s, 0)""",
                    [bot["id"], season["id"], cid, lock_ep],
                )
        print(f"  {a['name']:60}  roster ok")
    print(f"setup: {len(arche)} bots labeled + rostered for {season['name']}")


# ── play one episode ───────────────────────────────────────────────────────


def episode_points(cur, episode_id) -> dict:
    """Per-contestant gameplay points for one episode (mirrors the cast calc)."""
    cur.execute(
        """
        select se.contestant_id::text as cid, coalesce(sum(
          (case when s.merge_episode is not null
                 and ep.episode_number >= s.merge_episode
                 and et.postmerge_point_value is not null
                then et.postmerge_point_value else et.point_value end)
          * (case when et.is_per_unit then se.quantity else 1 end)), 0) as pts
        from scoring_events se
        join episodes ep on ep.id = se.episode_id
        join seasons s on s.id = ep.season_id
        join scoring_event_types et on et.event_type = se.event_type
        where se.episode_id = %s group by se.contestant_id""",
        [str(episode_id)],
    )
    return {r["cid"]: r["pts"] for r in cur.fetchall()}


def add_pick(cur, uid, epid, cid):
    cur.execute(
        "insert into elimination_picks (user_id, episode_id, contestant_id)"
        " values (%s, %s, %s)",
        [uid, str(epid), cid],
    )


def balance(cur, uid, sid) -> int:
    cur.execute(
        "select coalesce(sum(amount),0) b from token_transactions"
        " where user_id=%s and season_id=%s",
        [uid, sid],
    )
    return cur.fetchone()["b"]


def load_costs(cur) -> dict[str, int]:
    """Live advantage buy costs straight from the DB — never hardcode them; they
    retune (#258) and the bots exist to price advantages, so stale costs would
    skew the whole calibration."""
    cur.execute("select advantage_type, token_cost from advantage_types")
    return {r["advantage_type"]: r["token_cost"] for r in cur.fetchall()}


def buy_and_play(cur, uid, sid, episode_id, adv_type, target, costs):
    """Buy + play an advantage in one step if affordable; return True if done."""
    cost = costs[adv_type]
    if balance(cur, uid, sid) < cost:
        return False
    cur.execute(
        """insert into advantage_plays
        (user_id, season_id, episode_id, advantage_type,
         target_contestant_id, token_cost)
        values (%s,%s,%s,%s,%s,%s) returning id""",
        [uid, sid, str(episode_id), adv_type, target, cost],
    )
    pid = cur.fetchone()["id"]
    cur.execute(
        """insert into token_transactions
        (user_id, season_id, transaction_type, amount, advantage_play_id)
        values (%s,%s,'advantage_spend',%s,%s)""",
        [uid, sid, -cost, pid],
    )
    return True


def play(cur, episode_n: int):
    season = active_season(cur)
    sid = season["id"]
    costs = load_costs(cur)
    cur.execute(
        "select * from episodes where season_id=%s and episode_number=%s",
        [sid, episode_n],
    )
    ep = cur.fetchone()
    if not ep:
        sys.exit(f"Episode {episode_n} does not exist")
    if ep["status"] != "scored":
        sys.exit(f"Episode {episode_n} isn't scored yet — no results to script against")
    epid = ep["id"]

    cur.execute(
        "select contestant_id::text cid from eliminations where episode_id=%s",
        [str(epid)],
    )
    boots = [r["cid"] for r in cur.fetchall()]
    if not boots:
        sys.exit(f"Episode {episode_n} recorded no boot")
    pts = episode_points(cur, epid)
    cur.execute("select id::text cid from contestants where season_id=%s", [sid])
    wrong_pool = [r["cid"] for r in cur.fetchall() if r["cid"] not in boots]

    by_name = {a["name"]: a for a in archetypes()}
    cur.execute(
        "select id::text id, display_name from profiles where display_name = any(%s)",
        [list(by_name)],
    )
    bots = cur.fetchall()

    for bot in bots:
        a = by_name[bot["display_name"]]
        uid = bot["id"]
        cur.execute(
            "select 1 from elimination_picks where user_id=%s and episode_id=%s",
            [uid, str(epid)],
        )
        if cur.fetchone():
            continue  # idempotent

        cur.execute(
            """select contestant_id::text cid from roster_picks
            where user_id=%s and season_id=%s and active_until_episode is null""",
            [uid, sid],
        )
        roster = [r["cid"] for r in cur.fetchall()]

        def hits(kind) -> bool:
            return rng(uid, episode_n, kind) < a["skill"] / 100

        def pick(kind) -> str:
            """A boot on a hit, a random non-boot on a miss."""
            if hits(kind) or not wrong_pool:
                return boots[int(rng(uid, episode_n, kind, "b") * len(boots))]
            return wrong_pool[int(rng(uid, episode_n, kind, "w") * len(wrong_pool))]

        base = pick("vote")
        add_pick(cur, uid, epid, base)

        plays = a["plays"]
        if "double_vote" in plays:
            # double the base vote (only pays off if the base pick was correct)
            buy_and_play(cur, uid, sid, epid, "double_vote_points", base, costs)
        if "double_roster" in plays and roster:
            # double the real top scorer on a hit, else a random roster pick
            top = max(roster, key=lambda c: pts.get(c, 0))
            target = (
                top
                if hits("roster")
                else roster[int(rng(uid, episode_n, "rroll") * len(roster))]
            )
            buy_and_play(cur, uid, sid, epid, "double_roster_points", target, costs)
        if "extra_vote" in plays:
            if buy_and_play(cur, uid, sid, epid, "extra_vote", None, costs):
                extra = pick("extra")
                if extra != base:
                    add_pick(cur, uid, epid, extra)
    print(
        f"play: simulated {len(bots)} bots for episode {episode_n} of {season['name']}"
    )


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("setup", "play"):
        sys.exit(__doc__)
    conn = db()
    try:
        with conn.cursor() as cur:
            if sys.argv[1] == "setup":
                with httpx.Client(timeout=30) as http:
                    setup(cur, http)
            else:
                play(cur, int(sys.argv[2]))
        conn.commit()
    except Exception:
        conn.rollback()
        raise


if __name__ == "__main__":
    main()
