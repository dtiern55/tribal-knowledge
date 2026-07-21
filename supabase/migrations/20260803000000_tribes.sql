-- ============================================================
-- Tribes + time-aware membership (#212).
--
-- Colors and per-episode membership are imported from survivoR. Membership
-- is stored as change-points (from_episode = the episode a contestant joined
-- a tribe), so a contestant's CURRENT tribe is simply the row with the
-- largest from_episode. Swaps and the merge are just more change-points.
-- ============================================================
create table tribes (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  name       text not null,
  color      text not null,            -- hex, e.g. '#8D2F87'
  is_merge   boolean not null default false,
  created_at timestamptz not null default now(),
  unique (season_id, name)
);
alter table tribes enable row level security;

create table contestant_tribes (
  contestant_id uuid not null references contestants(id) on delete cascade,
  tribe_id      uuid not null references tribes(id) on delete cascade,
  from_episode  int  not null,         -- episode_number this tribe took effect
  primary key (contestant_id, from_episode)
);
alter table contestant_tribes enable row level security;
