-- Finale prediction redesign (#534): the fixed early-boot / fire-loss / winner
-- ballot becomes a survivor-centric bracket — your Final 4, your Final 3, and
-- the winner — so a finale with any number of finalists (S37 sends 6 in for two
-- tribals before the final 3) is scored the same way. Practice-season ballots
-- are disposable, so the old columns are dropped rather than backfilled.

-- ── ballot shape ────────────────────────────────────────────────────────────
alter table finale_predictions
  drop column early_boot_contestant_id,
  drop column fire_loss_contestant_id,
  add column final_four_contestant_ids  uuid[] not null default '{}',
  add column final_three_contestant_ids uuid[] not null default '{}';

-- ── prediction score types (template + every season snapshot) ────────────────
-- Base keeps the old 88 ceiling (final-4 4x6 + final-3 3x8 + winner 40); the new
-- volatility rides on the perfect-Final-3 bonus, which separates the players who
-- actually read the endgame from the ones who guessed most of it.
delete from prediction_score_types
  where key in ('correct_early_boot', 'correct_fire_loss');

insert into prediction_score_types (key, label, point_value, postmerge_point_value) values
  ('correct_final_four',  'Correct Final 4 pick',        6,  null),
  ('correct_final_three', 'Correct Final 3 pick',        8,  null),
  ('perfect_final_three', 'Perfect Final 3 (all three)', 12, null)
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
where t.key in ('correct_final_four', 'correct_final_three', 'perfect_final_three')
on conflict (season_id, key) do update
  set label = excluded.label, point_value = excluded.point_value;
