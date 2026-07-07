-- ============================================================
-- Simplify winner picks (decision #12, 2026-07-06):
-- one winner pick per season, no backup, locked early (default
-- episode 3, per-season configurable like roster_lock_episode).
-- Editable until the lock episode locks, then final.
--
-- Also drops steal_a_vote / immunity_idol from the advantage system
-- (decided as not fun for now; "immunity idol" name reserved for a
-- future mechanic) and adds advantage_types as the config table for
-- token costs, mirroring prediction_score_types (decision #9) so
-- costs are data, not code.
-- ============================================================

alter table seasons
  add column winner_lock_episode int check (winner_lock_episode > 0);

update seasons set winner_lock_episode = 3 where winner_lock_episode is null;

alter table winner_picks
  drop column backup_contestant_id;

delete from prediction_score_types where key = 'backup_sole_survivor';

-- ============================================================
-- advantage_types
-- Token cost per advantage, editable without a code change.
-- enabled = false retires a type without deleting play history.
-- ============================================================
create table advantage_types (
  advantage_type  text        primary key,
  label           text        not null,
  token_cost      int         not null check (token_cost >= 0),
  enabled         boolean     not null default true,
  created_at      timestamptz not null default now()
);

insert into advantage_types (advantage_type, label, token_cost)
values
  ('double_roster_points', 'Double Roster Points', 15),
  ('double_vote_points',   'Double Vote Points',    10),
  ('extra_vote',           'Extra Vote',            20);

alter table advantage_types enable row level security;

-- Drop the retired advantage types and re-add the check without them.
alter table advantage_plays
  drop constraint advantage_plays_advantage_type_check;

alter table advantage_plays
  add constraint advantage_plays_advantage_type_check
    check (advantage_type in (
      'double_roster_points',
      'double_vote_points',
      'extra_vote'
    ));

-- target_user_id, episode_affected_id, and status only ever existed for the
-- steal_a_vote / immunity_idol PvP interaction. With both gone, plays are
-- self-serve, always effective immediately, and never target another player.
alter table advantage_plays
  drop column target_user_id,
  drop column episode_affected_id,
  drop column status;

-- One play per advantage type per episode per player (self-serve, no admin
-- gate to catch an accidental double-submit).
alter table advantage_plays
  add constraint advantage_plays_user_episode_type_key
    unique (user_id, episode_id, advantage_type);
