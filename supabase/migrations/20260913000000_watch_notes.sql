-- Server-side store for the commissioner's live Watch tracker scratchpad
-- (#737), so it's readable from any device -- the scoring ritual reads it
-- during scoring instead of waiting on survivoR. One row per league-season
-- episode; effectively a single commissioner writes it.
create table episode_watch_notes (
    league_season_id uuid not null references league_seasons(id) on delete cascade,
    episode_id uuid not null references episodes(id) on delete cascade,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    primary key (league_season_id, episode_id)
);

-- FastAPI's service role is the only data path; the endpoints gate on is_admin.
alter table episode_watch_notes enable row level security;
