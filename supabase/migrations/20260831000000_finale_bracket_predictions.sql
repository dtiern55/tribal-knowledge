-- Finale prediction redesign (#534): the fixed early-boot / fire-loss / winner
-- ballot becomes a survivor-centric bracket — your Final 4, your Final 3, the
-- winner, and the final-immunity winner — so a finale with any number of
-- finalists (S37 sends 6 in for two tribals before the final 3) is scored the
-- same way. Practice-season ballots are disposable, so the old columns are
-- dropped rather than backfilled.

-- ── ballot shape ────────────────────────────────────────────────────────────
alter table finale_predictions
  drop column early_boot_contestant_id,
  drop column fire_loss_contestant_id,
  add column final_four_contestant_ids  uuid[] not null default '{}',
  add column final_three_contestant_ids uuid[] not null default '{}',
  add column final_immunity_contestant_id uuid references contestants(id);

-- ── prediction score types (template + every season snapshot) ────────────────
-- Base keeps the old 88 ceiling (final-4 4x6 + final-3 3x8 + winner 40); the
-- new volatility rides on two hard-to-earn bonuses that separate the players
-- who actually read the endgame.
delete from prediction_score_types
  where key in ('correct_early_boot', 'correct_fire_loss');

insert into prediction_score_types (key, label, point_value, postmerge_point_value) values
  ('correct_final_four',     'Correct Final 4 pick',          6,  null),
  ('correct_final_three',    'Correct Final 3 pick',          8,  null),
  ('perfect_final_three',    'Perfect Final 3 (all three)',   12, null),
  ('correct_final_immunity', 'Correct final-immunity winner', 12, null)
on conflict (key) do update
  set label = excluded.label, point_value = excluded.point_value;

-- Backfill the new keys into every season snapshot so the active season (S37)
-- scores under the new model — scoring reads the snapshot, not the template.
-- Completed practice seasons get them too: harmless, and they're slated for
-- deletion anyway.
insert into season_prediction_score_types (season_id, key, label, point_value, postmerge_point_value)
select s.id, t.key, t.label, t.point_value, t.postmerge_point_value
from seasons s
cross join prediction_score_types t
where t.key in ('correct_final_four', 'correct_final_three',
                'perfect_final_three', 'correct_final_immunity')
on conflict (season_id, key) do update
  set label = excluded.label, point_value = excluded.point_value;

-- ── final-immunity scoring event (the recorded fact the ballot resolves on) ──
-- A finale episode has several individual-immunity wins (final 6/5/4) that the
-- generic win_individual_immunity can't tell apart. The commissioner records
-- the LAST one (the final-4 immunity that locks a Final 3 seat) as this event
-- instead, so the ballot can resolve it. Same 15 roster points either way, so
-- the immunity winner's roster holders are unaffected.
insert into scoring_event_types
  (event_type, label, point_value, postmerge_point_value, token_value, is_per_unit, enabled)
values
  ('win_final_immunity', 'Win final immunity challenge', 15, null, 0, false, true)
on conflict (event_type) do update
  set label = excluded.label, point_value = excluded.point_value, enabled = excluded.enabled;

insert into season_scoring_event_types
  (season_id, event_type, label, point_value, postmerge_point_value, token_value, is_per_unit, enabled)
select s.id, t.event_type, t.label, t.point_value, t.postmerge_point_value,
       t.token_value, t.is_per_unit, t.enabled
from seasons s
cross join scoring_event_types t
where t.event_type = 'win_final_immunity'
on conflict (season_id, event_type) do update
  set label = excluded.label, point_value = excluded.point_value, enabled = excluded.enabled;
