-- ============================================================
-- Television-moment tokens: final list, values, and labels
-- (issue #14 decided 2026-07-18, replacing the placeholder seed).
-- Values match the last Make Your Picks season; labels shortened
-- for the Rules page and token ledger.
-- ============================================================

update scoring_event_types set label = 'Personal background story', token_value = 10
  where event_type = 'background_story_aired';
update scoring_event_types set label = 'That''s how you do it on Survivor', token_value = 5
  where event_type = 'survivor_moment';
update scoring_event_types set label = 'Cry', token_value = 5
  where event_type = 'cry_on_camera';
update scoring_event_types set label = 'Cuss', token_value = 5
  where event_type = 'cuss_on_camera';
