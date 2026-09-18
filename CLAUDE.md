# Tribal Knowledge

Fantasy Survivor league web app for a private group of ~18 friends.
Survivor airs twice a year; the league plays along every season.

## Git (overrides global standards)
In this repo Claude may commit and push without asking. The global "never run
git commits" rule does not apply here. Focused, reviewable commits still
expected; no AI attribution trailers.

**Always open a PR — don't merge to main directly.** Danny reviews the Vercel
preview from the PR before merging. Previews run against **staging**
(Supabase + Fly), never prod, and staging's backend is whatever was deployed
last (normally main). So a PR with backend changes is only reviewable on its
preview after "Deploy staging" is run for that branch (Actions → Deploy
staging → Run workflow → pick the branch); re-run it on `main` afterwards.
When handing over a PR, say which parts show on the preview as-is and which
need that staging run. Default flow: branch, push, `gh pr create`,
hand back the PR link. Merge (or `gh pr merge --auto`) only when Danny asks for
an auto-merge.

## Architecture
- All database access goes through FastAPI using the service role key.
  React never talks to Supabase directly.
- No ORM — raw SQL with psycopg2 via the `get_db()` context manager in `app/database.py`.
- No computed score caching — scores calculated live from `scoring_events` + picks.
- Multi-league (#595): `seasons` is the show, shared; a `league_seasons` row is one
  league playing it and owns the rule knobs. Every play table (rosters, picks,
  plays, brackets) keys on `league_season_id`; play routes are
  `/league-seasons/{id}/…`, show routes stay `/seasons/{season_id}/…`.
- RLS enabled on all tables (deny-all). FastAPI's service role key bypasses it.
- Every endpoint requires a Supabase JWT except `/health`. Other players'
  picks/rosters/ballots are 403 until their lock passes; token balances are
  owner-only.
- Frontend reads go through TanStack Query (#816), not `useEffect` + `useState`.
  `frontend/src/lib/queries.ts` owns the client and the helpers: `pathQuery(path)`
  keys every read by the `api.get` path it fetches (`null` disables it, for an id
  that isn't known yet), and writes invalidate through `onApiMutation` so
  `lib/api.ts` never imports the query layer. `api.quiet.*` is for a write that
  names its own `invalidateQueries` instead of taking the blanket one. Don't
  start a second pattern.
- A loading gate takes a side per read. One whose refusal the page **forgives**
  (it renders without it) waits on `isFetched`; one whose refusal reaches the
  **error gate** waits on `isPending`. Crossing it either way ships a bug: a
  refetch of a query holding no data resets it to pending, so `isPending` on a
  forgiven read re-closes the gate on every window focus, and `isFetched` on an
  error-gated read draws a live page against empty data during each retry. Put
  the error gate *before* the loading gate — a disabled query also reads as
  pending. Worked examples, both sides, at `MySeasonPage.tsx`'s gates.
- A value that keys a query must not be re-derived per render if anything is
  written against it. Latch the id in state and look the row up from live query
  data, or a list refetch silently re-points writes at a different row.
- All league times are Central (America/Chicago) in the UI; API/DB are UTC.
  Conversion happens in `frontend/src/lib/time.ts`.
- Database connects via Supabase transaction pooler (port 6543), not direct Postgres.
- See `../fantasy-survivor-design.md` for full scoring system and game mechanics.

## Documentation map
- `docs/schema.md` — database entities, relationships, RLS, and schema inspection.
- `docs/scoring.md` — live scoring computation and historical compatibility.
- `docs/operations.md` — setup, import, weekly scoring, bots, migrations, and deployment.
- `docs/README.md` — documentation boundaries and links.

## Commands
```bash
# Run tests (unit only — no DB required)
cd backend && uv run pytest -m "not integration"

# Run integration tests (requires local Supabase running)
cd backend && uv run pytest -m integration

# Frontend, before opening a PR — all three, no new warnings
# (one is pre-existing: NavDrawer.tsx:83)
cd frontend && npx tsc --noEmit -p tsconfig.app.json && npx vitest run && npm run -s lint
```

Prettier is deliberately not configured — running it rewrites the repo to double
quotes and semicolons. Hand-edit. A gitignored `frontend/.env.local` can make the
frontend suite pass locally while CI is red, so read `gh pr checks`, not just
local output.

## Deployment
Two environments (#150). Staging holds the frozen stage leagues (one per
point in a season, `docs/operations.md`) plus the bots; prod is the real
league and only moves on a version tag.
- **Staging** — merge to main runs `.github/workflows/deploy-staging.yml`:
  migrations (`SUPABASE_DB_URL_STAGING`), then Fly app
  `tribal-knowledge-staging`. Vercel builds main and every PR as a preview
  pointed at staging. "Run workflow" puts any branch's backend on staging.
- **Prod** — Actions → "Deploy production" → Run workflow with a version
  (or `gh release create vX`) runs `.github/workflows/deploy.yml`:
  migrations (`SUPABASE_DB_URL`), Fly app `tribal-knowledge-app`, health
  check, then fast-forwards the `production` branch that Vercel builds prod
  from. Claude never tags; Danny promotes.
- Laptop `backend/.env` points at staging. Prod credentials live in
  `backend/.env.prod` (gitignored); pass `uv run --env-file .env.prod` to
  opt a script into prod.
- `supabase db push` / `fly deploy` remain available for emergencies, but
  the workflows are the normal path.

## Do Not
- Never use supabase-py — psycopg2 only.
- Never talk to the database from the frontend.
- Never hardcode credentials — all secrets in backend/.env (staging) or backend/.env.prod.
- Never cache computed scores.
- Never add abstraction without a clear, immediate use case.
