# Tribal Knowledge

Fantasy Survivor league web app for a private group of ~18 friends.
Survivor airs twice a year; the league plays along every season.

## Stack
- **Backend**: FastAPI, Python, psycopg2
- **Database**: Supabase (Postgres), schema managed via migrations

## Architecture
- All database access goes through FastAPI using the service role key.
  React never talks to Supabase directly.
- No ORM — raw SQL with psycopg2 via the `get_db()` context manager in `app/database.py`.
- No computed score caching — scores calculated live from `scoring_events` + picks.
- RLS enabled on all tables (deny-all). FastAPI's service role key bypasses it.
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

# Run tests
cd backend && uv run pytest

# Lint and format
cd backend && uv run ruff check . && uv run black .

# Push migrations to Supabase Cloud
supabase db push
```

## Do Not
- Never use supabase-py — psycopg2 only.
- Never talk to the database from the frontend.
- Never hardcode credentials — all secrets in backend/.env.
- Never cache computed scores.
- Never add abstraction without a clear, immediate use case.
