# Operator runbook index

This is the shortest path to the authoritative command or UI. Commands assume
the repository root unless they begin with `cd backend` or `cd frontend`.

## Development and verification

| Task | Command |
| --- | --- |
| Start local Supabase | `supabase start` |
| Backend unit tests | `cd backend && uv run pytest -m "not integration"` |
| Full backend suite | Start local Supabase, then `cd backend && uv run pytest -q --tb=short` |
| Backend format/lint | `cd backend && uv run black --check . && uv run ruff check .` |
| Frontend tests | `cd frontend && npm test` |
| Frontend lint/build | `cd frontend && npm run lint && npm run build` |
| Rebuild local DB from migrations | `supabase db reset --local` — destructive to the local Supabase database only |
| Compare local/remote migration state | `supabase migration list --local` / `supabase migration list --linked` |

Frontend testing boundaries and shared helpers are documented in
[`../frontend/TESTING.md`](../frontend/TESTING.md).

## New-season setup

Use the Admin page for season configuration, contestants, and episode creation.
Before play begins, verify roster/merge/swap/advantage/Sole Survivor locks, the
elimination-pick schedule, finale flag, exact cast names, and episode lock times.
The detailed product checklist and current defaults live in the latest “Season
Setup Checklist” entry of [`../../fantasy-survivor-design.md`](../../fantasy-survivor-design.md).

The supporting scripts are dry-run-first:

```bash
cd backend

# Rename imported full names to show-used short names.
uv run python scripts/use_nicknames.py 50 --our-season 50
uv run python scripts/use_nicknames.py 50 --our-season 50 --apply

# Match and load headshots; --replace updates already populated images.
uv run python scripts/load_headshots.py 50 --our-season 50
uv run python scripts/load_headshots.py 50 --our-season 50 --apply
```

These scripts authenticate through the normal producer account. Required
variables are documented in [`../backend/.env.example`](../backend/.env.example);
headshot upload additionally needs the service-role key for storage.

## Weekly airing and scoring

1. Before the episode airs, verify the open episode and Central lock timestamp.
   For a practice season, run the forward-looking bot read before air:

   ```bash
   cd backend
   uv run python scripts/run_bots.py week 2
   ```

   Bot personas and read-file format are documented in
   [`../backend/scripts/run_bots.py`](../backend/scripts/run_bots.py) and
   [`../backend/scripts/bot_reads/README.md`](../backend/scripts/bot_reads/README.md).

2. After the episode, open **Admin → Episodes → Manage → Import**. The survivoR
   proposal is review-gated: resolve unmatched castaways, read every warning,
   add omitted safe tribes/team rewards and judgment calls manually, and verify
   eliminations and placements. The importer deliberately flags uncertainty
   instead of guessing.

3. Save corrections, then select **Score episode**. Scoring marks the lifecycle
   row `scored`; standings still calculate live, so focused fact corrections
   remain possible afterwards.

4. Verify standings and a player breakdown, then confirm the next episode is
   the only open window. A delayed scoring job intentionally leaves the current
   episode locked and does not open the next one early.

The equivalent CLI importer is also dry-run-first and posts through the normal
admin API:

```bash
cd backend
uv run python scripts/import_episode.py 50 2 --our-season 50
uv run python scripts/import_episode.py 50 2 --our-season 50 --apply
```

Use the Admin page after `--apply` for manual additions, corrections, review,
and the final score action.

## Practice bots

From `backend/`:

```bash
uv run python scripts/run_bots.py setup
uv run python scripts/run_bots.py draft
uv run python scripts/run_bots.py week 2
uv run python scripts/run_bots.py ballot
```

Bots write directly with the configured service-role database access and are
idempotent for their intended episode. They require an explicit commissioner
read and must run before the outcome is known; do not use them as a production
league-member workflow.

## Migrations and deployment

The normal release path is a reviewed merge to `main`:

1. [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs backend
   formatting/lint/full local-Supabase tests and frontend audit/lint/tests/build.
2. [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) applies
   migrations with `supabase db push`, then deploys the Fly backend and checks
   `/health`.
3. Vercel's GitHub integration deploys the frontend.

Before merging a migration, reconstruct the local database and run the full
suite. Migration filenames are ordered UTC timestamps; never edit a migration
that has already shipped. Add a later migration instead.

Emergency commands remain available but are not the routine release path:

```bash
supabase db push --db-url "$SUPABASE_DB_URL" --yes
cd backend && fly deploy
```

Use them only with the same migration-before-backend order as CI. Verify the
workflow, Fly health endpoint, and frontend deployment after any release.
