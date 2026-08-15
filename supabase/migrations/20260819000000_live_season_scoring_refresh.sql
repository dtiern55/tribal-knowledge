-- #381: scoring refresh for the first live season.
--
-- These changes update only the global templates. Existing seasons keep the
-- season-scoped snapshots taken when they were created, so practice and
-- completed seasons retain their original rules and scores.

insert into scoring_event_types
    (event_type, label, point_value, postmerge_point_value, token_value,
     is_per_unit, enabled)
values
  ('go_on_journey',
   'Go on a journey', 4, null, 0, false, true),
  ('play_other_advantage',
   'Play other advantage', 8, null, 0, false, true),
  ('play_idol',
   'Play an immunity idol', 10, null, 0, false, true),
  ('votes_blocked_by_idol',
   'Vote blocked by an immunity idol', 2, null, 0, true, true),
  ('episode_title_quote',
   'Say the quote used as the episode title', 3, null, 0, false, true),
  ('read_treemail_or_instructions',
   'Read Treemail or instructions aloud', 3, null, 0, true, true),
  ('jeff_thats_how_you_do_it',
   'Jeff says "That''s How You Do It On Survivor" directly to the castaway',
   5, null, 0, false, true)
on conflict (event_type) do update set
  label = excluded.label,
  point_value = excluded.point_value,
  postmerge_point_value = excluded.postmerge_point_value,
  token_value = excluded.token_value,
  is_per_unit = excluded.is_per_unit,
  enabled = excluded.enabled;

update scoring_event_types
set label = 'Immunity idol play saves its target', point_value = 5
where event_type = 'idol_played_successfully';

-- The generic play replaces these two narrow use events for new seasons.
-- Specific events such as idol nullifier and fake idol remain available and
-- do not stack with play_other_advantage.
update scoring_event_types
set enabled = false
where event_type in ('use_extra_vote', 'use_steal_a_vote');

update prediction_score_types
set point_value = 16, postmerge_point_value = 20
where key = 'correct_elimination';

update prediction_score_types set point_value = 40
where key = 'correct_winner_vote';

update prediction_score_types set point_value = 24
where key in ('correct_early_boot', 'correct_fire_loss');
