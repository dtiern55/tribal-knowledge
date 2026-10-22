-- "Other" read as vague next to the idol events; the acquire label keeps "other"
-- because it also sits beside Acquire extra vote.
update scoring_event_types
set label = 'Play non-idol advantage'
where event_type = 'play_other_advantage';

update season_scoring_event_types
set label = 'Play non-idol advantage'
where event_type = 'play_other_advantage';
