---
name: episode-lock
description: Set, move, lock, or unlock a season episode's picks-lock time (picks_lock_at) — the timestamp that closes picks and advantages for an episode. Use when locking an airing episode, reopening picks, or rescheduling when an episode's picks close. Covers the lock model plus the admin-API and direct-DB paths, with production safety.
---

# Episode lock — set / move / lock / unlock picks_lock_at

There is **no "lock" button and no `locked` status.** An episode is locked when
its `picks_lock_at` timestamp has passed (or it's been scored). Every operation
below — lock now, reopen, reschedule — is the same thing: **writing a new
`picks_lock_at`.**

## The lock model (read this once)

The rule lives in `backend/app/locking.py`:

```
EPISODE_LOCKED_SQL = "(picks_lock_at <= now() or status = 'scored')"
episode_locked(ep) = ep.picks_lock_at <= now()  OR  ep.status == 'scored'
```

- **Status doesn't change on lock.** An episode stays `upcoming` until it's
  scored; the app derives *open / airing / locked* from `picks_lock_at` + status,
  not from a status value. So to lock, you move the timestamp — you do **not**
  set `status = 'locked'` (there is no such status).
- **Locking one episode shuts the next one** until this one is scored (#11/#38 —
  `next_open_episode` / `airing_episode`). A locked-but-unscored episode is
  "airing": picks are in, nothing new can be entered, and episode N+1 stays
  closed until N is scored.
- **Advantages have a separate cutoff.** `advantage_lock_episode` on the season
  (helper `advantages_locked`) governs when advantages/tokens stop; the finale is
  always locked. Moving one episode's `picks_lock_at` does not touch that.
- **No caches.** Scores and lock state are computed live from the DB, so a change
  takes effect on the next page load — nothing to bust.

## 1. Pick the environment first (this writes real data)

- **Prod = the real league.** Its credentials are in `backend/.env.prod`;
  `backend/.env` is **staging** (#150), so a plain run cannot touch prod.
  Active seasons have `status = 'active'` (the show; several leagues may play it). A prod lock affects
  **every player league-wide.** Confirm with Danny before writing.
- **Local dev** is a separate stack (bring it up with the `verify` skill); use it
  to preview the locked-state UI without touching the league.

## 2. Times are UTC in the DB, Central in the UI

The DB stores `picks_lock_at` in UTC; the app shows Central
(`frontend/src/lib/time.ts`, and the AdminPage editor converts with
`centralLocalToUtc`). Reason about the target time in Central, store/send UTC.

## 3. Find the episode (read-only recon)

`app/database.py` calls `load_dotenv()` on import, so `get_db()` uses whatever
`backend/.env` points at (staging). Add `--env-file .env.prod` to `uv run`
for prod. Run from the backend dir:

```bash
cd backend && PYTHONPATH="$PWD" uv run python - <<'PY'
from app.database import get_db
from datetime import datetime, timezone
now = datetime.now(timezone.utc)
with get_db() as conn, conn.cursor() as cur:
    cur.execute("select id, name from seasons where status='active'")
    for s in cur.fetchall():
        print(f"SEASON {s['name']} {s['id']}")
        cur.execute("select id, episode_number, status, picks_lock_at from episodes"
                    " where season_id=%s order by episode_number", [s['id']])
        for e in cur.fetchall():
            locked = e['picks_lock_at'] is not None and e['picks_lock_at'] <= now
            print(f"  ep{e['episode_number']} status={e['status']} "
                  f"lock_at={e['picks_lock_at']} locked_now={locked} id={e['id']}")
PY
```

(Or via the API: `GET {API}/seasons` → the `active` one → `GET {API}/seasons/{id}/episodes`.)

## 4. The operations — each just sets `picks_lock_at`

| Goal | Set `picks_lock_at` to |
|------|------------------------|
| **Lock now** (episode airing) | `now()` |
| **Unlock / reopen picks** | a future time (e.g. the original lock time) |
| **Move / reschedule the lock** | the new intended time |
| **Set on a fresh/upcoming episode** | the desired time |

**Always capture the OLD value first** — reverting is just setting it back.

## Path A — Admin API (preferred; same as `air-episode`)

Get a producer JWT (creds in `backend/.env`: `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `PRODUCER_EMAIL`, `PRODUCER_PASSWORD`), the same way
`scripts/import_episode.py` does:

```
POST {SUPABASE_URL}/auth/v1/token?grant_type=password
  headers: apikey: {SUPABASE_ANON_KEY}
  json:    {"email": PRODUCER_EMAIL, "password": PRODUCER_PASSWORD}   → access_token
```

Then PATCH the episode (admin-only endpoint `update_episode`,
`backend/app/routers/episodes.py`). API base — prod:
`https://tribal-knowledge-app.fly.dev`, local: `http://127.0.0.1:8000`.

```bash
curl -X PATCH "$API/episodes/$EPISODE_ID" \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"picks_lock_at": "2026-08-20T00:00:00Z"}'
```

`EpisodeUpdateRequest` also accepts `episode_number`, `air_date`,
`max_elimination_picks`, `is_finale` — but for lock/move/unlock, `picks_lock_at`
is the only field you touch.

## Path B — Direct DB (fine for recon; use for a quick lock when the API/JWT is a hassle)

Equivalent to Path A — the PATCH endpoint is just an `UPDATE episodes SET
picks_lock_at = …` with validation that doesn't apply to a timestamp-only
change. Guard the `WHERE` with the episode number so a wrong id can't hit
another row:

```bash
cd backend && PYTHONPATH="$PWD" uv run python - <<'PY'
from app.database import get_db
from datetime import datetime, timezone
EP = "<episode_id>"; EP_NUM = 4          # both must match the row
with get_db() as conn, conn.cursor() as cur:
    cur.execute("select episode_number, status, picks_lock_at from episodes where id=%s", [EP])
    print("BEFORE:", cur.fetchone())      # <-- record this to revert
    cur.execute(
        "update episodes set picks_lock_at = now()"   # or a specific: %s with an ISO UTC value
        " where id=%s and episode_number=%s returning episode_number, status, picks_lock_at",
        [EP, EP_NUM],
    )
    print("AFTER:", cur.fetchone())
    conn.commit()
    print("locked_now =", (cur.fetchone() or {}))
PY
```

To **unlock / move**, replace `now()` with a specific value:
`... set picks_lock_at = %s ...` and pass an ISO-8601 UTC string (or a `datetime`).

## 5. Verify

Re-run the recon (`locked_now = picks_lock_at <= now()`) or reload the deployed
app. A locked, unscored episode shows the **airing / locked** state — the
torchlit night theme and read-only picks. When it's time to score it, hand off
to the `air-episode` skill.

## Safety

- **Confirm prod vs local** before writing; prod locks the whole league.
- **Record the old `picks_lock_at`** so a revert is one command.
- Locking finalizes whatever picks/advantages are already in — don't lock ahead
  of the intended air time if players may still be submitting.
- Never bulk-touch other episodes; scope every write to one `id` + `episode_number`.
