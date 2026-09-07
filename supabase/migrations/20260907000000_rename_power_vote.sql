-- Extra Vote ×2 → Power Vote (2026-09-07).
--
-- Same play (one extra pick that pays double, named by `target_contestant_id`);
-- only the label changes. "Power Vote" was the runner-up name in #673 and
-- reads as its own thing beside the ballot rather than a modifier on it.

update advantage_types
set label = 'Power Vote'
where advantage_type = 'double_vote_points';
