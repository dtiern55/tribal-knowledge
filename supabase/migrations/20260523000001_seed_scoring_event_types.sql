-- ============================================================
-- Seed: scoring_event_types
-- Baseline values from Make Your Picks (MYP).
-- All point/token values are subject to calibration.
-- ============================================================
insert into scoring_event_types (event_type, label, point_value, token_value, is_per_unit) values

  -- Point-earning roster events
  ('idol_played_successfully',   'Save someone by playing an idol successfully',  20,  0, false),
  ('shot_in_the_dark_success',   'Successful shot in the dark',                   15,  0, false),
  ('win_individual_immunity',    'Win individual immunity',                        15,  0, false),
  ('win_individual_reward',      'Win individual reward',                          12,  0, false),
  ('win_fire_making_challenge',  'Win final fire-making challenge',                12,  0, false),
  ('blindside_with_active_idol', 'Blindside someone with an active idol',           7,  0, false),
  ('join_jury',                  'Join the jury',                                   6,  0, false),
  ('acquire_active_idol',        'Acquire an active idol',                          10,  0, false),
  ('acquire_extra_vote',         'Acquire an extra vote',                            6,  0, false),
  ('win_team_immunity',          'Win team immunity',                                5,  0, false),
  ('acquire_inactive_idol',      'Acquire an inactive idol',                         5,  0, false),
  ('activate_inactive_idol',     'Activate an inactive idol',                        5,  0, false),
  ('win_team_reward',            'Win team reward',                                  4,  0, false),
  ('acquire_other_advantage',    'Acquire other advantage',                          4,  0, false),
  ('vote_correctly_at_tribal',   'Vote correctly at tribal',                         3,  0, false),

  -- Per-unit events (total = quantity × point_value)
  ('votes_received_premerge',    'Votes received at tribal (pre-merge)',             -3,  0, true),
  ('votes_received_postmerge',   'Votes received at tribal (post-merge)',            -2,  0, true),

  -- Negative point events
  ('eliminated_holding_idol',    'Eliminated while holding a real idol',             -6,  0, false),

  -- Token-earning events (these are Survivor game mechanics, not fantasy advantages)
  ('steal_immunity_idol',        'Steal an immunity idol',                            0, 20, false),
  ('play_idol_nullifier',        'Play an idol nullifier',                            0, 20, false),
  ('use_steal_a_vote',           'Use a steal-a-vote advantage',                      0, 15, false),
  ('use_extra_vote',             'Use an extra vote',                                 0, 10, false),
  ('fake_idol_played',           'Make a fake idol that gets played',                 0, 10, false);
