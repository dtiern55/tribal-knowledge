---
name: verify
description: Run the full app locally (Supabase + FastAPI + Vite) and drive it in a headless browser to verify frontend/backend changes end-to-end.
---

# Verifying changes in the running app

## Stack bring-up

```bash
# 1. Local Supabase (Docker; migrations run automatically)
supabase start

# 2. Backend against the local stack
cd backend && env DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=postgres \
  DB_USER=postgres DB_PASSWORD=postgres SUPABASE_URL=http://127.0.0.1:54100 \
  CORS_ORIGINS=http://localhost:5173 \
  uv run python -m uvicorn app.main:app --port 8000   # background

# 3. Frontend against local Supabase + backend (process env beats .env.local)
cd frontend && env VITE_SUPABASE_URL=http://127.0.0.1:54100 \
  VITE_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH \
  VITE_API_URL=http://localhost:8000 npm run dev      # background, port 5173
```

## Seeding a world

Reuse `backend/tests/helpers.py` (insert_season, insert_contestant,
insert_episode, insert_elimination, insert_roster_pick, insert_scoring_event)
from a throwaway script run with `cd backend && uv run --group dev python
<script>` after setting the DB_*/SUPABASE_* env vars above in os.environ
**before** importing `app.database`.

Create a real login (frontend uses password auth) via
`POST {SUPABASE_URL}/auth/v1/signup` with `apikey: <anon key>` — then insert a
matching `profiles` row. Self-forged JWTs won't pass the ES256 JWKS check.

Gotchas:
- `getActiveSeason()` picks the first season with status `active` — demote any
  stray active season in the local DB or your seed won't load:
  `docker exec supabase_db_survivor psql -U postgres -d postgres -c "..."`
  (no psql on the host).
- Roster card view needs the roster window closed: `roster_lock_episode=1`
  with episode 1 `status='scored'` and past `picks_lock_at`.
- SS designation window: open while the effective lock episode
  (`ss_lock_episode` → `advantage_lock_episode` → finale) is unscored with a
  future `picks_lock_at`; point `ss_lock_episode` at a scored episode to close.

## Driving the browser

Playwright works headless; chromium is cached in `~/.cache/ms-playwright` but
needs libasound2, which requires no root:

```bash
cd <scratchpad> && npm i playwright
apt-get download libasound2t64 && dpkg -x libasound2t64*.deb libs
LD_LIBRARY_PATH=$PWD/libs/usr/lib/x86_64-linux-gnu node shot.mjs
```

Login flow: fill `input[type=email]` / `input[type=password]` on `/login`,
click `button[type=submit]`, wait for URL to leave `/login`. Key routes:
`/` (My Season), `/seasons/:seasonId/team/:userId` (Team page).

Never verify against prod (issue #150) — always this local stack.
