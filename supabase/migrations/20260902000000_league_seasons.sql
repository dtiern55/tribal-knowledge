-- League-seasons (#595 step 2): one league playing one season.
--
-- `seasons` keeps only the show — cast, episodes, merge, status, and the
-- scoring snapshots every league shares. The rule knobs a league chooses
-- (roster size, lock episodes, swap economy, token-era settings) move to
-- league_seasons, and every per-player play row re-keys from season_id to
-- league_season_id so two leagues playing the same season keep separate
-- rosters, ballots, plays, and brackets.
--
-- Data: exactly one league exists at this point (the step-1 migration), so
-- each season gets one league_seasons row under it and every play row
-- follows its season into that row.

create table league_seasons (
  id                      uuid        primary key default gen_random_uuid(),
  league_id               uuid        not null references leagues(id) on delete cascade,
  season_id               uuid        not null references seasons(id) on delete cascade,
  roster_size             int         not null default 5 check (roster_size between 1 and 10),
  roster_lock_episode     int,
  swap_lock_episode       int,
  free_swaps              int         not null default 1,
  swap_penalty_step       int         not null default -5 check (swap_penalty_step <= 0),
  swap_penalty_floor      int         not null default -25 check (swap_penalty_floor <= 0),
  swap_token_cost         int         not null default 20,
  weekly_token_allocation int         not null default 0,
  token_economy_enabled   boolean     not null default false,
  ss_lock_episode         int,
  advantage_lock_episode  int,
  created_at              timestamptz not null default now(),
  unique (league_id, season_id)
);
alter table league_seasons enable row level security;

insert into league_seasons
  (league_id, season_id, roster_size, roster_lock_episode, swap_lock_episode,
   free_swaps, swap_penalty_step, swap_penalty_floor, swap_token_cost,
   weekly_token_allocation, token_economy_enabled, ss_lock_episode,
   advantage_lock_episode, created_at)
select l.id, s.id, s.roster_size, s.roster_lock_episode, s.swap_lock_episode,
       s.free_swaps, s.swap_penalty_step, s.swap_penalty_floor, s.swap_token_cost,
       s.weekly_token_allocation, s.token_economy_enabled, s.ss_lock_episode,
       s.advantage_lock_episode, s.created_at
from seasons s cross join leagues l;

alter table seasons
  drop column roster_size,
  drop column roster_lock_episode,
  drop column swap_lock_episode,
  drop column free_swaps,
  drop column swap_penalty_step,
  drop column swap_penalty_floor,
  drop column swap_token_cost,
  drop column weekly_token_allocation,
  drop column token_economy_enabled,
  drop column ss_lock_episode,
  drop column advantage_lock_episode;

-- roster_picks -------------------------------------------------------------
alter table roster_picks
  add column league_season_id uuid references league_seasons(id) on delete cascade;
update roster_picks rp set league_season_id = ls.id
  from league_seasons ls where ls.season_id = rp.season_id;
alter table roster_picks
  alter column league_season_id set not null,
  drop column season_id,  -- takes its unique constraint and the SS index with it
  add unique (user_id, league_season_id, contestant_id);
create unique index roster_picks_one_ss
  on roster_picks (user_id, league_season_id) where is_sole_survivor;

-- elimination_picks (was keyed by episode only) ----------------------------
alter table elimination_picks
  add column league_season_id uuid references league_seasons(id) on delete cascade;
update elimination_picks pick set league_season_id = ls.id
  from episodes ep join league_seasons ls on ls.season_id = ep.season_id
  where ep.id = pick.episode_id;
alter table elimination_picks
  alter column league_season_id set not null,
  drop constraint elimination_picks_user_id_episode_id_contestant_id_key,
  add unique (user_id, league_season_id, episode_id, contestant_id);

-- advantage_plays ----------------------------------------------------------
alter table advantage_plays
  add column league_season_id uuid references league_seasons(id) on delete cascade;
update advantage_plays ap set league_season_id = ls.id
  from league_seasons ls where ls.season_id = ap.season_id;
alter table advantage_plays
  alter column league_season_id set not null,
  drop column season_id,
  drop constraint advantage_plays_user_episode_type_target_key,
  add constraint advantage_plays_user_episode_type_target_key
    unique (user_id, league_season_id, episode_id, advantage_type, target_contestant_id);
drop index if exists advantage_plays_one_vote_double_per_episode;
create unique index advantage_plays_one_vote_double_per_episode
  on advantage_plays (user_id, league_season_id, episode_id)
  where advantage_type = 'double_vote_points' and target_contestant_id is null;

-- finale_predictions -------------------------------------------------------
alter table finale_predictions
  add column league_season_id uuid references league_seasons(id) on delete cascade;
update finale_predictions fp set league_season_id = ls.id
  from league_seasons ls where ls.season_id = fp.season_id;
alter table finale_predictions
  alter column league_season_id set not null,
  drop column season_id,
  add unique (user_id, league_season_id);

-- reveal_acknowledgements --------------------------------------------------
alter table reveal_acknowledgements
  add column league_season_id uuid references league_seasons(id) on delete cascade;
update reveal_acknowledgements ra set league_season_id = ls.id
  from league_seasons ls where ls.season_id = ra.season_id;
alter table reveal_acknowledgements
  alter column league_season_id set not null,
  drop column season_id,  -- drops the old primary key
  add primary key (user_id, league_season_id);

-- token_transactions (historical ledger) -----------------------------------
alter table token_transactions
  add column league_season_id uuid references league_seasons(id) on delete cascade;
update token_transactions tt set league_season_id = ls.id
  from league_seasons ls where ls.season_id = tt.season_id;
alter table token_transactions
  alter column league_season_id set not null,
  drop column season_id;
create unique index token_tx_one_starting_allocation
  on token_transactions (user_id, league_season_id)
  where transaction_type = 'starting_allocation';
create unique index token_tx_one_weekly_allocation_per_episode
  on token_transactions (user_id, league_season_id, episode_id)
  where transaction_type = 'weekly_allocation';
