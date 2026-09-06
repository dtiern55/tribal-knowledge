-- Double Ballot Points → Extra Vote ×2 (#673).
--
-- The play no longer doubles the whole ballot; it adds one extra pick that
-- pays double, named by `target_contestant_id`. The advantage_type key is
-- reused (#303-era plays keep a null target and keep scoring the old way —
-- completed seasons are time capsules, #170), so only the label changes.

update advantage_types
set label = 'Extra Vote ×2'
where advantage_type = 'double_vote_points';
