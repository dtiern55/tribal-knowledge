# Tribal Knowledge

Fantasy Survivor league web app for a private group of ~18 friends.
Survivor airs twice a year; the league plays along every season.

## Git (overrides global standards)
In this repo Claude may commit and push without asking. The global "never run
git commits" rule does not apply here. Focused, reviewable commits still
expected; no AI attribution trailers.

**Always open a PR — don't merge to main directly.** Danny reviews the Vercel
preview from the PR before merging. Default flow: branch, push, `gh pr create`,
hand back the PR link. Merge (or `gh pr merge --auto`) only when Danny asks for
an auto-merge.

## Architecture
- All database access goes through FastAPI using the service role key.
  React never talks to Supabase directly.
- No ORM — raw SQL with psycopg2 via the `get_db()` context manager in `app/database.py`.
- No computed score caching — scores calculated live from `scoring_events` + picks.
- RLS enabled on all tables (deny-all). FastAPI's service role key bypasses it.
- Every endpoint requires a Supabase JWT except `/health`. Other players'
  picks/rosters/ballots are 403 until their lock passes; token balances are
  owner-only.
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
```

## Deployment
Everything ships from GitHub on merge to main — no manual deploy steps:
- `.github/workflows/deploy.yml` pushes migrations (`supabase db push`) then
  deploys the backend to Fly, in that order, when `backend/**` or
  `supabase/migrations/**` change. Secrets: `SUPABASE_DB_URL` (session
  pooler, port 5432), `FLY_API_TOKEN`.
- Frontend deploys via Vercel's GitHub integration on every merge.
- `supabase db push` / `fly deploy` remain available for emergencies, but
  the workflow is the normal path.

## Do Not
- Never use supabase-py — psycopg2 only.
- Never talk to the database from the frontend.
- Never hardcode credentials — all secrets in backend/.env.
- Never cache computed scores.
- Never add abstraction without a clear, immediate use case.
