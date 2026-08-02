-- ============================================================
-- Double Vote Points doubles the WHOLE ballot, not one named pick (#303).
--
-- Doubling one named pick only paid when that specific guess landed. A real
-- human hit 19% of individual picks across the practice seasons, so the
-- advantage whiffed ~80% of the time and asked players to answer a question
-- nobody can answer ("which of my three guesses is the good one?"). Applied to
-- every pick in the episode it pays whenever ANY of them lands (~57% of
-- episodes), and the decision becomes "is this the week I'm confident?".
--
-- Repriced 10 -> 15 so it sits level with Double Roster Points on points per
-- token (0.66 vs 0.62) instead of well above it.
--
-- History needs no snapshot table: old plays carry a target_contestant_id and
-- keep scoring exactly as they did, new plays store NULL and cover the whole
-- ballot. The scoring joins branch on that. Completed seasons stay time
-- capsules (#170), so unlike the earlier cost retune this does NOT reprice
-- plays already bought.
-- ============================================================

update advantage_types set token_cost = 15
where advantage_type = 'double_vote_points';

-- Untargeted plays would otherwise stack: NULLs are distinct in
-- advantage_plays_user_episode_type_target_key, which is exactly what lets
-- extra votes stack on purpose. Two stacked doubles would join the scoring
-- query twice and quadruple the ballot.
create unique index advantage_plays_one_vote_double_per_episode
  on advantage_plays (user_id, episode_id)
  where advantage_type = 'double_vote_points' and target_contestant_id is null;
