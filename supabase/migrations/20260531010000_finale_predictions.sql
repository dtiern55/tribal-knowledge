-- ============================================================
-- finale_predictions
-- The three-part finale ballot, submitted for the final episode:
--   early_boot  — who is voted out first (5 -> 4)
--   fire_loss   — who loses the fire-making challenge (4 -> 3)
--   winner      — who wins the season
-- One row per user per season; slots are nullable (partial ballots allowed).
-- Distinct from the season-long winner_pick (locked at merge); the two stack.
-- ============================================================
create table finale_predictions (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references profiles(id) on delete cascade,
  season_id                 uuid not null references seasons(id) on delete cascade,
  early_boot_contestant_id  uuid references contestants(id),
  fire_loss_contestant_id   uuid references contestants(id),
  winner_contestant_id      uuid references contestants(id),
  created_at                timestamptz not null default now(),
  unique (user_id, season_id)
);

create index on finale_predictions (season_id);

alter table finale_predictions enable row level security;

-- Finale prediction values (winner vote already seeded as correct_winner_vote).
insert into prediction_score_types (key, label, point_value, postmerge_point_value)
values
  ('correct_early_boot', 'Correct finale early-boot prediction',       18, null),
  ('correct_fire_loss',  'Correct finale fire-making-loss prediction', 18, null);
