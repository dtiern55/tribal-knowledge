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
Two environments (#150). Staging is where bots, practice seasons, and test
signups live; prod is the real league and only moves on a version tag.
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
