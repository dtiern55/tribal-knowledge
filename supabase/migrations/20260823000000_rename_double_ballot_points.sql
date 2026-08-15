-- Double Vote Points → Double Ballot Points.
--
-- "Vote" read as though it doubled a single vote; it doubles the whole ballot
-- (#303). The Rules page renders advantage_types.label straight from the API,
-- so leaving the row alone would have shown players the old name on one screen
-- and the new one everywhere else.
--
-- The advantage_type key is untouched — it is referenced by advantage_plays
-- rows and by scoring.

update advantage_types
set label = 'Double Ballot Points'
where advantage_type = 'double_vote_points';
