# Tribal Knowledge

Fantasy Survivor league web app for a private group of ~18 friends.
Survivor airs twice a year; the league plays along every season.

## Stack
- **Backend**: FastAPI, Python, psycopg2
- **Database**: Supabase (Postgres), schema managed via migrations

## Git (overrides global standards)
In this repo Claude may commit, push, merge to main, and deploy without asking.
The global "never run git commits" rule does not apply here. Focused,
reviewable commits still expected; no AI attribution trailers.

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

## Structure
```
tribal-knowledge/
  backend/
    app/
      main.py        # FastAPI entry point
      database.py    # psycopg2 get_db() context manager
      routers/       # one file per domain
    scripts/         # admin CLI tools (survivoR episode importer)
    tests/
    requirements.txt
    .env.example
  supabase/
    migrations/      # numbered SQL files, never edited after push
    config.toml
```

## Commands
```bash
# Install all dependencies (runtime + dev)
cd backend && uv sync --group dev

# Run backend locally
cd backend && uv run python -m uvicorn app.main:app --reload

# Run tests (unit only — no DB required)
cd backend && uv run pytest -m "not integration"

# Run integration tests (requires local Supabase running)
cd backend && uv run pytest -m integration

# Run all tests
cd backend && uv run pytest

# Lint and format
cd backend && uv run ruff check . && uv run black .
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

## Local development (integration tests)

Requires Docker Desktop with WSL integration enabled.

```bash
# Start local Supabase (runs migrations automatically)
supabase start

# Reset DB and re-run all migrations
supabase db reset

# Stop local Supabase
supabase stop
```

Local DB credentials (used by `backend/.env.test`):
- Host: `127.0.0.1`, Port: `5433`, DB/User: `postgres`, Password: `postgres`
- Studio: http://127.0.0.1:54101
- API: http://127.0.0.1:54100

## Do Not
- Never use supabase-py — psycopg2 only.
- Never talk to the database from the frontend.
- Never hardcode credentials — all secrets in backend/.env.
- Never cache computed scores.
- Never add abstraction without a clear, immediate use case.
