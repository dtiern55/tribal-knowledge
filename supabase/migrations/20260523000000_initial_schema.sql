-- ============================================================
-- profiles
-- Extends auth.users. One row per league member.
-- ============================================================
create table profiles (
  id              uuid        primary key references auth.users(id) on delete cascade,
  display_name    text        not null,
  is_admin        boolean     not null default false,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- seasons
-- One row per Survivor season the league plays.
-- ============================================================
create table seasons (
  id                    uuid  primary key default gen_random_uuid(),
  name                  text  not null,
  season_number         int   not null unique,
  roster_size           int   not null default 5 check (roster_size between 1 and 10),
  roster_lock_episode   int,
  merge_episode         int,
  status                text  not null default 'upcoming'
                              check (status in ('upcoming', 'active', 'completed')),
  created_at            timestamptz not null default now()
);

-- ============================================================
-- contestants
-- Survivor castaways, scoped to a season.
-- placement set at finale: 1 = winner, 2 = runner-up, etc.
-- ============================================================
create table contestants (
  id          uuid  primary key default gen_random_uuid(),
  season_id   uuid  not null references seasons(id) on delete cascade,
  name        text  not null,
  placement   int   check (placement > 0),
  created_at  timestamptz not null default now(),
  unique (season_id, name)
);

-- ============================================================
-- episodes
-- One row per episode. max_elimination_picks set per-season
-- based on field size (3 early, 2 mid, 1 late).
-- ============================================================
create table episodes (
  id                      uuid    primary key default gen_random_uuid(),
  season_id               uuid    not null references seasons(id) on delete cascade,
  episode_number          int     not null check (episode_number > 0),
  air_date                date    not null,
  max_elimination_picks   int     not null check (max_elimination_picks between 1 and 3),
  is_finale               boolean not null default false,
  picks_lock_at           timestamptz not null,
  status                  text    not null default 'upcoming'
                                  check (status in ('upcoming', 'picks_open', 'picks_locked', 'scored')),
  created_at              timestamptz not null default now(),
  unique (season_id, episode_number)
);

-- ============================================================
-- eliminations
-- Who was eliminated each episode. Multiple rows per episode
-- for double eliminations.
-- ============================================================
create table eliminations (
  id                uuid  primary key default gen_random_uuid(),
  episode_id        uuid  not null references episodes(id) on delete cascade,
  contestant_id     uuid  not null references contestants(id) on delete cascade,
  elimination_type  text  not null
                          check (elimination_type in (
                            'voted_out',
                            'medical_evacuation',
                            'quit',
                            'fire_making_loss'
                          )),
  created_at        timestamptz not null default now(),
  unique (episode_id, contestant_id)
);

-- ============================================================
-- scoring_event_types
-- Config table: event type → point value and token value.
-- point_value can be negative (e.g. votes received).
-- is_per_unit = true means total = quantity × value (votes received).
-- ============================================================
create table scoring_event_types (
  event_type    text    primary key,
  label         text    not null,
  point_value   int     not null default 0,
  token_value   int     not null default 0,
  is_per_unit   boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- scoring_events
-- Manual entries made after each episode airs.
-- Contestant-based facts only (not user predictions).
-- ============================================================
create table scoring_events (
  id              uuid  primary key default gen_random_uuid(),
  episode_id      uuid  not null references episodes(id) on delete cascade,
  contestant_id   uuid  not null references contestants(id) on delete cascade,
  event_type      text  not null references scoring_event_types(event_type),
  quantity        int   not null default 1 check (quantity > 0),
  notes           text,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- advantage_plays
-- Log of every advantage activation by a league member.
-- target_user_id: used for steal_a_vote
-- target_contestant_id: used for double_roster_points, swap_a_pick
-- episode_affected_id: for steal_a_vote (takes effect next episode)
-- status: pending until immunity idol window closes (steal_a_vote only)
-- ============================================================
create table advantage_plays (
  id                    uuid  primary key default gen_random_uuid(),
  user_id               uuid  not null references profiles(id) on delete cascade,
  episode_id            uuid  not null references episodes(id) on delete cascade,
  advantage_type        text  not null
                              check (advantage_type in (
                                'double_roster_points',
                                'double_vote_points',
                                'extra_vote',
                                'swap_a_pick',
                                'change_backup_pick',
                                'change_winner_pick',
                                'steal_a_vote',
                                'immunity_idol'
                              )),
  target_user_id        uuid  references profiles(id),
  target_contestant_id  uuid  references contestants(id),
  episode_affected_id   uuid  references episodes(id),
  status                text  not null default 'resolved_success'
                              check (status in (
                                'pending',
                                'resolved_success',
                                'resolved_blocked'
                              )),
  token_cost            int   not null check (token_cost >= 0),
  created_at            timestamptz not null default now()
);

-- ============================================================
-- roster_picks
-- A user's season-long team using effective episode ranges.
-- active_until_episode null = still active on the roster.
-- swap_penalty_points is set to -20 when a row is closed by a swap.
-- A contestant can only appear once per user per season (no re-adding
-- after a swap).
-- ============================================================
create table roster_picks (
  id                    uuid  primary key default gen_random_uuid(),
  user_id               uuid  not null references profiles(id) on delete cascade,
  season_id             uuid  not null references seasons(id) on delete cascade,
  contestant_id         uuid  not null references contestants(id) on delete cascade,
  active_from_episode   int   not null check (active_from_episode > 0),
  active_until_episode  int   check (active_until_episode > 0),
  swap_penalty_points   int   not null default 0 check (swap_penalty_points <= 0),
  created_at            timestamptz not null default now(),
  unique (user_id, season_id, contestant_id),
  check (active_until_episode is null or active_until_episode >= active_from_episode)
);

-- ============================================================
-- elimination_picks
-- A user's weekly vote predictions. Unordered set.
-- is_doubled: true if the Double Vote Points advantage targets this pick.
-- Partial unique index enforces at most one doubled pick per user per episode.
-- ============================================================
create table elimination_picks (
  id              uuid    primary key default gen_random_uuid(),
  user_id         uuid    not null references profiles(id) on delete cascade,
  episode_id      uuid    not null references episodes(id) on delete cascade,
  contestant_id   uuid    not null references contestants(id) on delete cascade,
  is_doubled      boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (user_id, episode_id, contestant_id)
);

create unique index elimination_picks_one_doubled_per_episode
  on elimination_picks (user_id, episode_id)
  where is_doubled = true;

-- ============================================================
-- winner_picks
-- Full history of winner/backup pick changes per user per season.
-- Current pick = most recent row (highest effective_episode, then created_at).
-- Change count = COUNT(*) - 1, drives escalating token costs.
-- ============================================================
create table winner_picks (
  id                      uuid  primary key default gen_random_uuid(),
  user_id                 uuid  not null references profiles(id) on delete cascade,
  season_id               uuid  not null references seasons(id) on delete cascade,
  winner_contestant_id    uuid  not null references contestants(id),
  backup_contestant_id    uuid  not null references contestants(id),
  effective_episode       int   not null check (effective_episode > 0),
  created_at              timestamptz not null default now(),
  unique (user_id, season_id, effective_episode),
  check (winner_contestant_id != backup_contestant_id)
);

-- ============================================================
-- token_transactions
-- Append-only ledger. Token balance = SUM(amount) for a user in a season.
-- scoring_event_id: set for gameplay_event rows
-- advantage_play_id: set for advantage_spend rows
-- ============================================================
create table token_transactions (
  id                  uuid  primary key default gen_random_uuid(),
  user_id             uuid  not null references profiles(id) on delete cascade,
  season_id           uuid  not null references seasons(id) on delete cascade,
  episode_id          uuid  references episodes(id),
  transaction_type    text  not null
                            check (transaction_type in (
                              'starting_allocation',
                              'weekly_allocation',
                              'gameplay_event',
                              'television_moment',
                              'advantage_spend'
                            )),
  amount              int   not null,
  scoring_event_id    uuid  references scoring_events(id),
  advantage_play_id   uuid  references advantage_plays(id),
  notes               text,
  created_at          timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index on contestants          (season_id);
create index on episodes             (season_id);
create index on eliminations         (episode_id);
create index on eliminations         (contestant_id);
create index on scoring_events       (episode_id);
create index on scoring_events       (contestant_id);
create index on roster_picks         (user_id, season_id);
create index on roster_picks         (contestant_id);
create index on elimination_picks    (episode_id);
create index on elimination_picks    (user_id, episode_id);
create index on winner_picks         (user_id, season_id);
create index on token_transactions   (user_id, season_id);
create index on advantage_plays      (episode_id);
create index on advantage_plays      (episode_affected_id);
create index on advantage_plays      (target_user_id);

-- ============================================================
-- Row-Level Security
-- All tables locked down. FastAPI uses the service_role key which
-- bypasses RLS, so all access is controlled at the API layer.
-- ============================================================
alter table profiles            enable row level security;
alter table seasons             enable row level security;
alter table contestants         enable row level security;
alter table episodes            enable row level security;
alter table eliminations        enable row level security;
alter table scoring_event_types enable row level security;
alter table scoring_events      enable row level security;
alter table advantage_plays     enable row level security;
alter table roster_picks        enable row level security;
alter table elimination_picks   enable row level security;
alter table winner_picks        enable row level security;
alter table token_transactions  enable row level security;
