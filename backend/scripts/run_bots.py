"""Practice-league bot driver — persona-based, forward-looking (#307 era).

Twenty bots plus the human make a 21-player league. Each bot has a
PERSONA, not a skill dial, and acts on the commissioner's pre-episode read of
what the room would do. Nothing here knows the result: picks are made BEFORE
the episode airs, exactly like a real player's, so the driver can run against
a season nobody has watched yet.

That's the whole point of the rewrite. The old driver was handed the answer
and used a skill percentage to decide how often to use it, which made every
measurement of player behaviour circular — bots "predicting" the boot were
just echoing it back. Now the commissioner supplies the BEHAVIOUR and survivoR
supplies the OUTCOME, and the interaction is what we learn from.

Usage (from backend/):
    uv run python scripts/run_bots.py setup            # accounts + persona labels
    uv run python scripts/run_bots.py draft            # opening rosters (needs read)
    uv run python scripts/run_bots.py week 2           # picks + plays for ep 2
    uv run python scripts/run_bots.py ballot           # finale ballot
    uv run python scripts/run_bots.py ballot --check   # preflight, writes nothing

`week N` runs BEFORE episode N airs. Import and score the episode afterwards
with scripts/import_episode.py, then run `week N+1`.

The read file (scripts/bot_reads/season_<n>.json) is the commissioner's input:

    {
      "draft": ["Mike White", "John Hennigan", ...],       // desirability order
      "episodes": {
        "2": {
          "likely_boots":    ["Jessica Peet", "Pat Cusack", "Natalia Azoqa"],
          "double_targets":  ["Mike White"],
          "note":            "Goliath looks like a powerhouse"
        }
      },
      "finale": { "final_four": [...], "final_three": [...],
                  "winner": [...], "final_immunity": [...] }
    }

likely_boots is either a plain name list (rank order — bots cluster on the
front) or a weighted list of [name, weight] pairs when you want to pin the
vote split directly:

    "likely_boots": [["Lyrsa Torres", 14], ["Kara Kay", 12],
                     ["Angelina Keeley", 6], ["Gabby Pascuzzi", 5],
                     ["Alison Raybould", 5]]

Weights apportion the non-contrarian pick slots (Hamilton method), so the
tally tracks the split instead of collapsing onto the top name — a plain rank
sort is convex and can't hold a steep-top/flat-tail shape. Weight every boot
or none within an episode. Contrarians stay off-consensus regardless.

Names are matched loosely (case and punctuation insensitive) against the
season's contestants; anything unrecognised is reported rather than ignored.

Writes directly to the DB with the service role, idempotent per episode.
"""

import hashlib
import json
import math
import os
import re
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

ENV = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(ENV)

READS_DIR = Path(__file__).resolve().parent / "bot_reads"

# The league Danny signed off on (2026-08-04): 20 bots + the human = 21,
# sized to the bot accounts already carrying history from earlier seasons.
# Two contrarians exactly, as specified; the rest scale.
# `spread` controls how far down
# the read's likely-boot list a bot will wander: small hugs the consensus,
# large spreads out. Nobody skips their weekly play.
#
#   flex        — reads the week: doubles a roster star if they hold one,
#                 otherwise doubles the ballot
#   roster      — always doubles a rostered castaway
#   vote        — always doubles the ballot
#   contrarian  — picks off-consensus, and doubles the ballot when the room
#                 looks confident (a short likely-boot list)
PERSONAS = [
    ("Consensus", 5, 0.6, "flex"),
    ("Reader", 7, 1.8, "flex"),
    ("Contrarian", 2, 2.5, "contrarian"),
    ("Roster Loyalist", 4, 1.0, "roster"),
    ("Vote Gambler", 2, 0.5, "vote"),
]


def archetypes() -> list[dict]:
    out = []
    for label, count, spread, style in PERSONAS:
        for i in range(1, count + 1):
            out.append(
                {
                    "name": f"{label} {i}" if count > 1 else label,
                    "spread": spread,
                    "style": style,
                }
            )
    return out


def rng(*parts) -> float:
    """Deterministic 0..1 from a stable seed — reproducible bot luck."""
    h = hashlib.sha256("·".join(str(p) for p in parts).encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def norm(name: str) -> str:
    return re.sub(r"[^a-z]", "", name.lower())


def biased_order(items: list, spread: float, *seed) -> list:
    """Deterministic shuffle biased toward the front of `items`.

    An exponential race: each item's key is its rank penalty minus log(u).
    spread → 0 always takes the list in order; large spread approaches a
    uniform shuffle. This is what makes bots agree with each other without
    being identical — real leagues read the same edit and cluster, which the
    old independent-coin-flip bots could never reproduce.
    """
    keyed = []
    for i, it in enumerate(items):
        u = max(rng(*seed, it), 1e-9)
        keyed.append((i / max(spread, 0.01) - math.log(u), it))
    return [it for _, it in sorted(keyed, key=lambda kv: kv[0])]


def largest_remainder(weights: list[float], total: int) -> list[int]:
    """Apportion `total` integer slots across weights (Hamilton method)."""
    s = sum(weights)
    if s <= 0 or total <= 0:
        return [0] * len(weights)
    raw = [w / s * total for w in weights]
    out = [int(x) for x in raw]
    for i in sorted(range(len(weights)), key=lambda i: raw[i] - out[i], reverse=True)[
        : total - sum(out)
    ]:
        out[i] += 1
    return out


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


def load_read(season) -> dict:
    path = READS_DIR / f"season_{season['season_number']}.json"
    if not path.exists():
        sys.exit(
            f"No read file at {path}\n"
            "Create it with the commissioner's pre-episode read — see the"
            " module docstring for the shape."
        )
    return json.loads(path.read_text())


def resolve(cur, sid, names: list[str], label: str) -> list[str]:
    """Read-file names → contestant ids, loudly on a miss.

    A typo silently dropping a name would quietly change every bot's picks,
    so an unknown name stops the run instead.
    """
    cur.execute("select id::text cid, name from contestants where season_id=%s", [sid])
    by_norm = {norm(r["name"]): r["cid"] for r in cur.fetchall()}
    out, missing = [], []
    for n in names:
        cid = by_norm.get(norm(n))
        (out if cid else missing).append(cid or n)
    if missing:
        sys.exit(f"{label}: not in this season's cast: {missing}")
    return out


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
    """Accounts and persona labels. Needs no read — run it any time.

    Deliberately separate from `draft`: labelling is static config, while the
    draft is a per-season call that can't be made until the premiere has been
    watched. Bundling them left the bots wearing a previous season's names
    while waiting on a read they didn't need.
    """
    arche = archetypes()
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
    if len(bots) > len(arche):
        # zip() would quietly pair only the first len(arche) and leave the
        # rest carrying a previous season's name with no roster — and an
        # active season's standings lists every profile, so they'd sit there
        # at zero all season. Surplus bots can't just be deleted either:
        # their history is what completed seasons still score (#170).
        surplus = [b["display_name"] for b in bots[len(arche) :]]
        sys.exit(
            f"{len(bots)} bot accounts but {len(arche)} personas.\n"
            f"Unassigned: {surplus}\n"
            "Widen PERSONAS to cover them, or retire the accounts first —"
            " setup will not leave bots half-configured."
        )

    for a, bot in zip(arche, bots):
        cur.execute(
            "update profiles set display_name = %s where id = %s",
            [a["name"], bot["id"]],
        )
        print(f"  {bot['display_name']:<26} → {a['name']:<20} {a['style']}")
    print(f"setup: {len(arche)} bots labelled")


def draft(cur):
    """Draft every bot's opening roster from the read's desirability order.

    Run after the premiere, before the roster lock. Popular castaways get
    over-rostered and the unpopular ones barely owned, which is what makes a
    mid-season boot actually hurt the league.
    """
    season = active_season(cur)
    read = load_read(season)
    arche = archetypes()
    bots = load_bots(cur)
    lock_ep = season["roster_lock_episode"] or 1
    require_history_scored(cur, str(season["id"]), lock_ep)
    # Anyone already voted out is off the board — nobody drafts a dead slot.
    everyone = alive_ids(cur, season["id"])
    wanted = [
        c
        for c in resolve(cur, season["id"], read.get("draft", []), "draft")
        if c in everyone
    ]
    # Desirability order: the read's wanted list, then everyone unmentioned,
    # then anyone the read explicitly flags as unwanted after a rough
    # premiere — they still get drafted occasionally, just last.
    shunned = [
        c
        for c in resolve(cur, season["id"], read.get("avoid", []), "avoid")
        if c in everyone
    ]
    middle = [c for c in everyone if c not in wanted and c not in shunned]
    pool = wanted + middle + shunned

    n = 0
    for a, bot in zip(arche, bots):
        cur.execute(
            "select count(*) n from roster_picks where user_id=%s and season_id=%s",
            [bot["id"], season["id"]],
        )
        if cur.fetchone()["n"]:
            continue
        picks = biased_order(pool, a["spread"], bot["id"], "draft")[
            : season["roster_size"]
        ]
        for cid in picks:
            cur.execute(
                """insert into roster_picks
                (user_id, season_id, contestant_id, active_from_episode,
                 swap_penalty_points)
                values (%s,%s,%s,%s,0)""",
                [bot["id"], season["id"], cid, lock_ep],
            )
        n += 1
    print(f"draft: {n} bots rostered for {season['name']}")


# ── one week ───────────────────────────────────────────────────────────────


def require_history_scored(cur, sid, upto: int):
    """Refuse to act while an earlier episode is still unscored.

    Bots read who's alive from the eliminations table, so running before an
    episode is imported makes a voted-out castaway look available — David vs.
    Goliath drafted and voted for a castaway who left in the premiere because
    the draft ran before episode 1 was scored.
    """
    cur.execute(
        "select episode_number from episodes where season_id=%s"
        " and episode_number < %s and status <> 'scored'"
        " order by episode_number",
        [sid, upto],
    )
    stale = [r["episode_number"] for r in cur.fetchall()]
    if stale:
        sys.exit(
            f"Episode(s) {stale} aren't scored yet.\n"
            "Import and score them first — until then the bots can't see who's"
            " already out, and will draft or vote for them."
        )


def next_open_ep(cur, sid):
    """The episode currently open for picks — mirrors app/locking.py.

    The roster_lock_episode clause matters: a watch-only premiere is never
    open, so without it the driver reports episode 1 while the app is already
    taking picks for episode 2.
    """
    cur.execute(
        """
        select e.* from episodes e join seasons s on s.id = e.season_id
        where e.season_id=%s and e.status <> 'scored'
          and e.episode_number >= coalesce(s.roster_lock_episode, 1)
        order by e.episode_number limit 1
        """,
        [sid],
    )
    ep = cur.fetchone()
    if ep is None:
        return None
    # Locked but unscored means it's airing — nothing is open until it's
    # scored, same as the app.
    return ep if ep["picks_lock_at"] > datetime.now(timezone.utc) else None


def alive_ids(cur, sid) -> list[str]:
    cur.execute(
        """select c.id::text cid from contestants c
           where c.season_id=%s and not exists (
             select 1 from eliminations e where e.contestant_id = c.id)""",
        [sid],
    )
    return [r["cid"] for r in cur.fetchall()]


def used_play(cur, uid, epid) -> bool:
    cur.execute(
        "select 1 from advantage_plays where user_id=%s and episode_id=%s",
        [uid, str(epid)],
    )
    return cur.fetchone() is not None


def has_sole_survivor(cur, uid, sid) -> bool:
    cur.execute(
        "select 1 from roster_picks"
        " where user_id=%s and season_id=%s and is_sole_survivor",
        [uid, sid],
    )
    return cur.fetchone() is not None


def active_roster(cur, uid, sid) -> list[dict]:
    cur.execute(
        "select id, contestant_id::text cid, active_from_episode af"
        " from roster_picks where user_id=%s and season_id=%s"
        " and active_until_episode is null",
        [uid, sid],
    )
    return cur.fetchall()


def swapped_this_episode(cur, uid, sid, episode_n) -> bool:
    """One swap per episode (#404): a swap closes the outgoing pick at N-1."""
    cur.execute(
        "select 1 from roster_picks where user_id=%s and season_id=%s"
        " and active_until_episode=%s",
        [uid, sid, episode_n - 1],
    )
    return cur.fetchone() is not None


def swaps_committed(cur, uid, sid) -> int:
    cur.execute(
        "select count(*) n from roster_picks where user_id=%s and season_id=%s"
        " and active_until_episode is not null",
        [uid, sid],
    )
    return cur.fetchone()["n"]


def swap_penalty(season, ordinal) -> int:
    """Mirrors roster.py (#404): the first free_swaps are free, then the Nth
    swap costs step * N, floored."""
    if ordinal <= season["free_swaps"]:
        return 0
    return max(season["swap_penalty_step"] * ordinal, season["swap_penalty_floor"])


def do_swap(cur, uid, sid, ep, old_pick, new_cid, penalty):
    """Mirrors POST /roster/swap: close the old row with its penalty, open the
    new one. The swap no longer touches the weekly play (#404)."""
    cur.execute(
        "update roster_picks set active_until_episode=%s, swap_penalty_points=%s"
        " where id=%s",
        [ep["episode_number"] - 1, penalty, old_pick["id"]],
    )
    cur.execute(
        "insert into roster_picks"
        " (user_id, season_id, contestant_id, active_from_episode)"
        " values (%s,%s,%s,%s)",
        [uid, sid, new_cid, ep["episode_number"]],
    )


def week(cur, episode_n: int):
    """Make every bot's picks, swaps and advantage play for one episode.

    Runs BEFORE the episode airs. Order matters: a swap can consume the
    week's play, so swaps resolve first and the advantage choice sees what's
    left — the same trade-off a human faces on the page.
    """
    season = active_season(cur)
    sid = season["id"]
    read = load_read(season)
    ep_read = (read.get("episodes") or {}).get(str(episode_n))
    if not ep_read:
        sys.exit(
            f"No read for episode {episode_n} in"
            f" season_{season['season_number']}.json"
        )

    require_history_scored(cur, str(sid), episode_n)
    cur.execute(
        "select * from episodes where season_id=%s and episode_number=%s",
        [sid, episode_n],
    )
    ep = cur.fetchone()
    if not ep:
        sys.exit(f"Episode {episode_n} doesn't exist in {season['name']}")
    nxt = next_open_ep(cur, sid)
    if not nxt or nxt["episode_number"] != episode_n:
        open_n = nxt["episode_number"] if nxt else None
        sys.exit(
            f"Episode {episode_n} isn't the open one (open: {open_n}) —"
            " bots only act on the episode that accepts picks"
        )

    # likely_boots is either a plain name list (rank order) or a weighted list
    # of [name, weight] pairs. Weights give the commissioner direct control of
    # the vote split — a rank-penalty sort alone is convex and can't hold a
    # steep-top/flat-tail shape (e.g. 14/12/6/5/5). All-or-nothing per episode.
    raw_boots = ep_read.get("likely_boots", [])
    paired = [isinstance(e, (list, tuple)) for e in raw_boots]
    if any(paired) and not all(paired):
        sys.exit("likely_boots: weight every boot as [name, weight], or none")
    weighted = bool(raw_boots) and all(paired)
    boot_names = [e[0] if w else e for e, w in zip(raw_boots, paired)]
    boot_weights = [float(e[1]) if w else None for e, w in zip(raw_boots, paired)]
    boots = resolve(cur, sid, boot_names, "likely_boots")
    targets = set(
        resolve(cur, sid, ep_read.get("double_targets", []), "double_targets")
    )
    # Castaways the room simply won't vote for this week. Without this they
    # fall into `others` and the spread/contrarian personas hand them votes
    # anyway, which contradicts a read that says nobody would.
    safe = set(resolve(cur, sid, ep_read.get("safe", []), "safe"))
    # The draft's avoid list still applies to swap-ins: sorting the pool by
    # fewest owners otherwise picks whoever nobody wants, precisely because
    # nobody wants them.
    shunned = set(resolve(cur, sid, read.get("avoid", []), "avoid"))
    alive = alive_ids(cur, sid)
    live_pairs = [
        (c, w) for c, w in zip(boots, boot_weights) if c in alive and c not in safe
    ]
    boots = [c for c, _ in live_pairs]
    boot_weights = [w for _, w in live_pairs]
    others = [c for c in alive if c not in boots and c not in safe]
    # How sure the room is about the boot — stated, not inferred. Deriving it
    # from len(likely_boots) conflated "how many people could go" with "how
    # sure am I", so a read listing both tribes read as uncertain and pushed
    # every flex bot onto their roster star.
    confidence = (ep_read.get("confidence") or "medium").lower()
    if confidence not in ("high", "medium", "low"):
        sys.exit(f"confidence must be high, medium or low — got {confidence!r}")
    confident = confidence == "high"
    unsure = confidence == "low"
    # Can never vote for every remaining castaway (#240)
    max_picks = max(0, min(ep["max_elimination_picks"], len(alive) - 1))

    swap_lock = season["swap_lock_episode"]
    if swap_lock is None and season["merge_episode"] is not None:
        swap_lock = season["merge_episode"] + 2
    swaps_open = not ep["is_finale"] and not (
        swap_lock is not None and episode_n >= swap_lock
    )
    # Designation closes when episode ss_lock itself locks (app/routers/
    # roster.py:_effective_ss_lock). Bots only ever run on the episode that
    # still accepts picks, so that episode is by definition unlocked — which
    # makes "ss_lock has not locked yet" simply ss_lock >= episode_n.
    ss_lock = season["ss_lock_episode"] or season["advantage_lock_episode"]
    ss_open = ss_lock is None or ss_lock >= episode_n

    cur.execute(
        """select contestant_id::text cid, count(*) n from roster_picks
           where season_id=%s and active_until_episode is null group by 1""",
        [sid],
    )
    owned = {r["cid"]: r["n"] for r in cur.fetchall()}

    by_name = {a["name"]: a for a in archetypes()}
    picks_made = swaps_made = plays_made = ss_made = 0
    # roster_swap counts PAID swaps now, not advantage plays (#404).
    tally = {"double_roster_points": 0, "double_vote_points": 0, "paid_swap": 0}

    bot_rows = load_bots(cur)
    # Weighted mode: cap each boot's non-contrarian picks to its apportioned
    # share, so the read's vote split holds instead of collapsing onto the top
    # name. Contrarians stay off-consensus and uncapped. dbl_used spreads the
    # double-roster plays across targets rather than piling on the most-rostered.
    caps = None
    if weighted:
        nonc = sum(
            1
            for b in bot_rows
            if (by_name.get(b["display_name"]) or {}).get("style") != "contrarian"
        )
        caps = dict(zip(boots, largest_remainder(boot_weights, max_picks * nonc)))
    dbl_used: dict[str, int] = {}

    for bot in bot_rows:
        a = by_name.get(bot["display_name"])
        if not a:
            continue
        uid = bot["id"]

        # --- swap out dead weight (an eliminated castaway) ---
        # No longer gated on the weekly play (#404) — swaps have their own
        # economy: one per episode, priced in points.
        if swaps_open and not swapped_this_episode(cur, uid, sid, episode_n):
            roster = active_roster(cur, uid, sid)
            held = {p["cid"] for p in roster}
            swappable = [p for p in roster if p["af"] < episode_n]
            # Only a corpse is worth a swap. Danny's rule (2026-08-05): there
            # is never a reason to burn one unless your team is down to four
            # or fewer — which is exactly what holding an eliminated castaway
            # means. Dropping someone merely *likely* to go bails on players
            # who often survive, and spends a finite resource on a guess.
            dead = [p for p in swappable if p["cid"] not in alive]
            ordinal = swaps_committed(cur, uid, sid) + 1
            penalty = swap_penalty(season, ordinal)
            add_pool = [c for c in alive if c not in held]
            # Always drop a corpse (Danny 2026-08-21): a dead castaway scores
            # zero going forward, so swapping in a live one pays for itself even
            # at the point penalty. Every bot uses its swap when there's dead
            # weight to clear — no persona opts out.
            out = dead[0] if dead else None
            if out and add_pool:
                # Order by how few people already own them, or every bot picks
                # whoever sorts first and the whole league swaps in one name.
                pool = [c for c in add_pool if c not in shunned] or add_pool
                want = [c for c in pool if c in targets] or pool
                want = sorted(want, key=lambda c: owned.get(c, 0))
                new = biased_order(want, a["spread"], uid, episode_n, "swapin")[0]
                owned[new] = owned.get(new, 0) + 1
                do_swap(cur, uid, sid, ep, out, new, penalty)
                swaps_made += 1
                if penalty:
                    tally["paid_swap"] += 1

        # --- elimination picks, sampled from the read ---
        cur.execute(
            "select count(*) n from elimination_picks"
            " where user_id=%s and episode_id=%s",
            [uid, str(ep["id"])],
        )
        if cur.fetchone()["n"] == 0 and max_picks:
            if a["style"] == "contrarian":
                # deliberately off-consensus: the field first, the crowd's
                # names only if there's room left
                order = biased_order(others, a["spread"], uid, episode_n, "pick")
                order += biased_order(boots, a["spread"], uid, episode_n, "pick2")
                chosen = order[:max_picks]
            elif caps is not None:
                # weighted: draw only from boots with capacity left, so the
                # commissioner's split holds; overflow to the field if the caps
                # empty before this bot is served.
                avail = [c for c in boots if caps.get(c, 0) > 0]
                chosen = biased_order(avail, a["spread"], uid, episode_n, "pick")[
                    :max_picks
                ]
                if len(chosen) < max_picks:
                    chosen += biased_order(others, a["spread"], uid, episode_n, "fill")[
                        : max_picks - len(chosen)
                    ]
                for c in chosen:
                    if c in caps:
                        caps[c] -= 1
            else:
                chosen = biased_order(
                    boots + others, a["spread"], uid, episode_n, "pick"
                )[:max_picks]
            for cid in chosen:
                cur.execute(
                    "insert into elimination_picks (user_id, episode_id, contestant_id)"
                    " values (%s,%s,%s)",
                    [uid, str(ep["id"]), cid],
                )
                picks_made += 1

        # --- the week's one advantage play ---
        if not used_play(cur, uid, ep["id"]):
            held = {p["cid"] for p in active_roster(cur, uid, sid)}
            star = [c for c in held if c in targets]
            if a["style"] == "roster":
                choice = "double_roster_points"
            elif a["style"] == "vote":
                choice = "double_vote_points"
            elif a["style"] == "contrarian":
                choice = "double_vote_points" if confident else "double_roster_points"
            else:
                # flex reads the week: when the room is confident about the
                # boot, back your ballot; otherwise back a roster star if you
                # hold one. Without the confidence term this collapses to
                # "roster double every week", because the draft over-rosters
                # the same names the read names as targets.
                if confident:
                    choice = "double_vote_points"
                elif unsure:
                    choice = "double_roster_points" if star else "double_vote_points"
                else:
                    # Middling week: split on whether this bot's star is one
                    # the room is actually backing, rather than all-or-nothing.
                    choice = (
                        "double_roster_points"
                        if star and rng(uid, episode_n, "lean") < 0.5
                        else "double_vote_points"
                    )
            # a quarter of the time a flex/contrarian bot goes the other way
            wobbly = a["style"] in ("flex", "contrarian")
            if wobbly and rng(uid, episode_n, "flip") < 0.25:
                choice = (
                    "double_vote_points"
                    if choice == "double_roster_points"
                    else "double_roster_points"
                )
            target = None
            if choice == "double_roster_points":
                pool = star or [c for c in held if c in alive]
                if not pool:
                    choice, target = "double_vote_points", None
                else:
                    # Spread doubles across targets: back the one this bot holds
                    # that the league has doubled least so far. Plain biased_order
                    # piled every bot onto the most-rostered name (#draft star).
                    target = min(
                        pool,
                        key=lambda c: (
                            dbl_used.get(c, 0),
                            rng(uid, episode_n, "dbl", c),
                        ),
                    )
                    dbl_used[target] = dbl_used.get(target, 0) + 1
            cur.execute(
                """insert into advantage_plays
                (user_id, season_id, episode_id, advantage_type,
                 target_contestant_id, token_cost)
                values (%s,%s,%s,%s,%s,0)""",
                [uid, sid, str(ep["id"]), choice, target],
            )
            plays_made += 1
            tally[choice] += 1

        # --- sole survivor: one per season, at random (Danny 2026-08-23) ---
        # The read is forward-looking and has no opinion on who wins, so this
        # is a coin toss across the bot's live roster rather than a judgement.
        # alive_ids already excludes the eliminated, who aren't valid (#180).
        if ss_open and not has_sole_survivor(cur, uid, sid):
            live = [p["cid"] for p in active_roster(cur, uid, sid) if p["cid"] in alive]
            if live:
                cur.execute(
                    "update roster_picks set is_sole_survivor = true"
                    " where user_id=%s and season_id=%s and contestant_id=%s",
                    [uid, sid, min(live, key=lambda c: rng(uid, "ss", c))],
                )
                ss_made += 1

    print(f"week {episode_n} of {season['name']}:")
    print(f"  {picks_made} picks, {swaps_made} swaps, {plays_made} plays")
    if ss_made:
        print(f"  {ss_made} sole survivors designated")
    if any(tally.values()):
        print(
            "  plays: "
            + ", ".join(f"{k.replace('_', ' ')} {v}" for k, v in tally.items() if v)
        )
    if ep_read.get("note"):
        print(f"  read: {ep_read['note']}")


# ── finale ballot ──────────────────────────────────────────────────────────


# Each finale slate and how many names a bot commits to it (#534). The read
# gives a candidate pool per slate (commissioner's lean, ranked); each bot takes
# the top few after its own biased shuffle. Slates score independently against
# the actual bracket, so a bot needn't keep them nested.
FINALE_SLATES = (
    ("final_four", 4),
    ("final_three", 3),
    ("winner", 1),
    ("final_immunity", 1),
)
FINALE_KEYS = tuple(key for key, _ in FINALE_SLATES)


def finale_preflight(cur, season):
    """Everything that can stop or quietly spoil a finale ballot, checked at
    once (#534).

    The point is to be runnable on any ordinary evening, not discovered on
    finale night: `ballot --check` reports and writes nothing. Problems are
    fatal, warnings are not - a stale read still files a ballot, it just files
    a worse one, and you should be told which.
    """
    sid = season["id"]
    problems, warnings, fields = [], [], {}

    read = load_read(season)
    fin_read = read.get("finale")
    if not fin_read:
        problems.append(
            f"no 'finale' block in season_{season['season_number']}.json"
            " - see bot_reads/README.md for the shape"
        )

    cur.execute(
        "select episode_number from episodes where season_id=%s and is_finale",
        [sid],
    )
    fin = cur.fetchone()
    if fin:
        print(f"  ok  finale episode flagged (ep {fin['episode_number']})")
    else:
        problems.append("no episode in this season is flagged is_finale")

    alive = alive_ids(cur, sid)
    if fin_read:
        for key, count in FINALE_SLATES:
            named = fin_read.get(key, [])
            # resolve() exits on a name that isn't in the cast at all; that is
            # a typo, and staying loud about it is the existing behaviour.
            ids = resolve(cur, sid, named, f"finale.{key}")
            live = [c for c in ids if c in alive]
            fields[key] = live or alive
            if not named:
                warnings.append(
                    f"finale.{key}: no names read - every bot picks from the"
                    f" whole field of {len(alive)}"
                )
            elif not live:
                # The silent half of the old `or alive`: a read overtaken by
                # events looks like a read right up until it spreads the bots
                # at random.
                warnings.append(
                    f"finale.{key}: all {len(named)} names are already out"
                    f" - falls back to the whole field of {len(alive)}"
                )
            elif len(live) < len(ids):
                out = len(ids) - len(live)
                warnings.append(
                    f"finale.{key}: {out} of {len(ids)} names"
                    f" {'is' if out == 1 else 'are'} already out"
                )
            else:
                n = len(live)
                print(
                    f"  ok  finale.{key}: {n} name{'' if n == 1 else 's'}, all still in"
                )
            # A slate needs at least as many live candidates as seats, or bots
            # can't fill it (a Final 4 read of only 3 live names).
            if len(fields[key]) < count:
                warnings.append(
                    f"finale.{key}: only {len(fields[key])} live candidate(s)"
                    f" for {count} seat(s) - bots will fill what they can"
                )

    for w in warnings:
        print(f"  !   {w}")
    for pb in problems:
        print(f"  X   {pb}")
    return problems, fields


def ballot(cur, check_only=False):
    """Every bot files a finale bracket ballot from the read's finale block.

    Forward-looking like everything else: the read is who the ROOM would back,
    not who actually won. Each slate (Final 4, Final 3, winner, final immunity)
    is filled from its own read pool by the bot's biased order.
    """
    season = active_season(cur)
    sid = season["id"]
    print(f"finale ballot preflight for {season['name']}:")
    problems, fields = finale_preflight(cur, season)
    if problems:
        sys.exit(f"\n{len(problems)} problem(s) - no ballots filed.")
    if check_only:
        print("\ncheck only - nothing written.")
        return

    by_name = {a["name"]: a for a in archetypes()}
    n = 0
    for bot in load_bots(cur):
        a = by_name.get(bot["display_name"])
        if not a:
            continue
        uid = bot["id"]
        cur.execute(
            "select 1 from finale_predictions where user_id=%s and season_id=%s",
            [uid, sid],
        )
        if cur.fetchone():
            continue
        chosen = {
            key: biased_order(fields[key], a["spread"], uid, "finale", key)[:count]
            for key, count in FINALE_SLATES
        }
        cur.execute(
            """insert into finale_predictions
            (user_id, season_id, final_four_contestant_ids,
             final_three_contestant_ids, winner_contestant_id,
             final_immunity_contestant_id)
            values (%s,%s,%s::uuid[],%s::uuid[],%s,%s)""",
            [
                uid,
                sid,
                chosen["final_four"],
                chosen["final_three"],
                chosen["winner"][0] if chosen["winner"] else None,
                chosen["final_immunity"][0] if chosen["final_immunity"] else None,
            ],
        )
        n += 1
    print(f"ballot: {n} bots filed for {season['name']}")


def main():
    cmds = ("setup", "draft", "week", "ballot")
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        sys.exit(
            f"usage: run_bots.py {{{'|'.join(cmds)}}} [episode]\n"
            "       run_bots.py ballot --check   (preflight only, writes nothing)"
        )
    conn = db()
    try:
        with conn.cursor() as cur:
            if sys.argv[1] == "setup":
                with httpx.Client(timeout=30) as http:
                    setup(cur, http)
            elif sys.argv[1] == "draft":
                draft(cur)
            elif sys.argv[1] == "ballot":
                ballot(cur, check_only="--check" in sys.argv[2:])
            else:
                if len(sys.argv) < 3:
                    sys.exit("usage: run_bots.py week <episode_number>")
                week(cur, int(sys.argv[2]))
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
