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
# --only NAME redoes a single castaway whose crop came out wrong.
uv run python scripts/load_headshots.py 50 --our-season 50
uv run python scripts/load_headshots.py 50 --our-season 50 --apply

# Load age, occupation, and hometown from survivoR (#262). The prose bio has
# no importable source and stays hand-written.
uv run python scripts/load_bios.py 50 --our-season 50
uv run python scripts/load_bios.py 50 --our-season 50 --apply

# Load the CBS cast questionnaire (expandable Q&A on the contestant page)
# from the Survivor wiki. --skip TEXT drops questions by substring if one
# needs holding back.
uv run python scripts/load_bio_qa.py 50 --our-season 50
uv run python scripts/load_bio_qa.py 50 --our-season 50 --apply
```

These scripts authenticate through the normal producer account. Required
variables are documented in [`../backend/.env.example`](../backend/.env.example);
headshot upload additionally needs the service-role key for storage.

## Weekly airing and scoring

1. Before the episode airs, verify the open episode and Central lock timestamp.
   For a practice season, run the forward-looking bot read before air:

   ```bash
   cd backend
   uv run python scripts/run_bots.py week 2 --league Bots --season 101
   ```

   Bot personas and read-file format are documented in
   [`../backend/scripts/run_bots.py`](../backend/scripts/run_bots.py) and
   [`../backend/scripts/bot_reads/README.md`](../backend/scripts/bot_reads/README.md).

2. After the episode, open **Admin → Episodes → Manage → Import**. The survivoR
   proposal is review-gated: resolve unmatched castaways, read every warning,
   add omitted safe tribes/team rewards and judgment calls manually, and verify
   eliminations and placements. The importer deliberately flags uncertainty
   instead of guessing.

3. Nothing is saved until the commissioner has approved the whole result:
   eliminations (final, or to Redemption Island), events, judgment calls, the
   results card headline, and each Reveal tile as it will render. Saving
   eliminations and events shows on standings and the cast page at once; the
   headline and tiles stay hidden until the episode is scored. The
   `air-episode` skill runs this order (#712).

4. Save corrections, set the headline and tiles, then select **Score
   episode** last. Scoring marks the lifecycle row `scored` and opens the
   results card to players; standings still calculate live, so focused fact
   corrections remain possible afterwards.

5. Verify standings and a player breakdown, then confirm the next episode is
   the only open window. A delayed scoring job intentionally leaves the current
   episode locked and does not open the next one early.

6. Back up prod. Free-tier Supabase keeps no backups, so this weekly dump is
   the only copy of the league's picks:

   ```bash
   cd backend
   uv run --env-file .env.prod python scripts/backup_db.py prod
   ```

   Writes `~/projects/survivor/backups/prod-<date>/{schema,data}.sql` (public
   schema; public + auth data, minus session churn) via the Supabase CLI, which
   needs Docker running. Without the env file it dumps staging. To restore into
   a fresh project: `supabase db push` the migrations, then
   `psql "$SESSION_POOLER_URL" -f data.sql`.

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
uv run python scripts/run_bots.py setup --league Bots
uv run python scripts/run_bots.py draft --league Bots --season 101
uv run python scripts/run_bots.py week 2 --league Bots --season 101
uv run python scripts/run_bots.py ballot --league Bots --season 101
```

Bots live on staging (#150); `backend/.env` already points there.
Bots play in a league of their own (#595): create it on the Admin page, sign
it up for the season, then `setup` enrolls the bots. Every writing command
names the league and season, and refuses a league with any real player (the commissioner may join), so a
practice run can never touch a league real players are in. Bots write directly
with the configured service-role database access and are idempotent for their
intended episode. They require an explicit commissioner
read and must run before the outcome is known; do not use them as a production
league-member workflow.

## Environments

| | Staging | Production |
| --- | --- | --- |
| Supabase | `tribal-knowledge-staging` | `tribal-knowledge` |
| Backend | `https://tribal-knowledge-staging.fly.dev` | `https://tribal-knowledge-app.fly.dev` |
| Frontend | `https://snakes-and-rats-git-main-dtiern55s-projects.vercel.app` (and every PR preview) | `https://snakesandrats.app` (old `tribal-knowledge-nu.vercel.app` stays live for existing PWA installs) |
| Deploys on | merge to `main`, or "Run workflow" on any branch | Actions → "Deploy production" → Run workflow with a version (or a `v*` tag) |
| Holds | bots, practice seasons, test signups | the real league only |

Scripts read `backend/.env`, which points at staging. Prod credentials live in
`backend/.env.prod` (gitignored); opt a command into prod with
`uv run --env-file .env.prod python scripts/...`. Free-tier Supabase pauses a
project after a week idle — if staging returns errors, unpause it in the
dashboard.

### Staging stages

Staging holds one league per point in a season's life, all clones of the
scored David vs. Goliath run, so a preview can be checked at any stage without
waiting for a lock to pass. Open episodes lock in 2099, so the snapshots never
decay. Danny, the producer, and the bots are the only accounts.

| League | Scored | State on the preview |
| --- | --- | --- |
| Stage: pre-draft | none | Episode 1 open, rosters empty, join and draft flows |
| Stage: before-ep2 | 1 | First recap and standings, roster editable until the lock at 2 |
| Stage: swap-window | 1–5 | Roster locked, swaps and advantages live, pre-merge |
| Stage: post-merge | 1–7 | Merge tribe, post-merge points, jury not seated |
| Stage: locked-not-scored | 1–8 | Episode 9 locked but unscored; other players' picks visible |
| Stage: jury-locked | 1–10 | Swaps closed (first juror + 2), ballot only |
| Stage: finale | 1–12 | Finale open, bracket ballot |
| Stage: complete | all | Season completed, final standings |
| Stage: finale-locked | 1–12 | Finale locked but unscored; the Locked page on finale night |
| Stage: first-loss | 1–4 | One of Danny's castaways just voted out, nothing filed for 5, free swap in hand: the "tribe has spoken" moment (#717) |

Rebuild the set (it wipes everything else on staging, dry run by default):

```bash
uv run python scripts/stage_staging.py          # dry run: per-stage counts
uv run python scripts/stage_staging.py --apply  # rebuild
```

The source season has to be on staging. If it isn't, copy prod first
(`scripts/copy_prod_to_staging.py --apply`, which remaps user ids by email and
gives everyone else a placeholder login), then run the stage script.

To add one stage without a rebuild, clone it from "Stage: complete" (a full
copy of the source), which deletes nothing:

```bash
uv run python scripts/stage_staging.py --add finale-locked --apply
```

After any rebuild, re-run the data seeds the stages depend on:
`scripts/seed_x2_targets.py --apply` (bots' ×2 plays get a named pick) and
`scripts/seed_locked_stage.py --apply` (the locked-not-scored stage's empty
states and Danny's named ×2).

## Migrations and deployment

1. [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every PR:
   backend formatting/lint/full local-Supabase tests and frontend
   audit/lint/tests/build.
2. Merging to `main` runs
   [`deploy-staging.yml`](../.github/workflows/deploy-staging.yml): migrations
   with `supabase db push`, then the staging Fly app and its `/health`. Vercel
   rebuilds the main preview.
3. When staging looks right, Actions → "Deploy production" → Run workflow,
   type a version, and [`deploy.yml`](../.github/workflows/deploy.yml) runs:
   prod migrations, prod Fly app, `/health`, a fast-forward of the
   `production` branch (which Vercel builds the production frontend from),
   then the GitHub release. Pushing a `v*` tag by hand does the same minus
   the release step. Tags are dates or counters; nothing parses them.

Reviewing a PR on its Vercel preview: the preview is the PR's frontend against
staging's backend, which is whatever was deployed last (normally `main`). For a
PR that changes backend code, run "Deploy staging" on that branch first, review,
then re-run it on `main` so staging matches what's merged.

Before merging a migration, reconstruct the local database and run the full
suite. Migration filenames are ordered UTC timestamps; never edit a migration
that has already shipped. Add a later migration instead.

Emergency commands remain available but are not the routine release path:

```bash
supabase db push --db-url "$SUPABASE_DB_URL" --yes
cd backend && fly deploy
```

Use them only with the same migration-before-backend order as CI, and against
staging first. Verify the workflow, Fly health endpoint, and frontend deployment
after any release.
