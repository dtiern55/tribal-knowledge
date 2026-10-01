-- Shorter label for Jeff's line: drop "directly to the castaway". The rule is
-- unchanged, only its wording, so every season's snapshot takes it too.

update scoring_event_types
set label = 'Jeff says "That''s How You Do It On Survivor"'
where event_type = 'jeff_thats_how_you_do_it';

update season_scoring_event_types
set label = 'Jeff says "That''s How You Do It On Survivor"'
where event_type = 'jeff_thats_how_you_do_it';
