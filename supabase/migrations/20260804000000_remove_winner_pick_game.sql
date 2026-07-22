-- ============================================================
-- Remove the classic Winner Pick game — the league is Sole Survivor only
-- going forward (#164). The app isn't live yet, so there's no historical
-- winner-pick data to preserve. The actual season winner (contestants.placement,
-- the finale "correct winner vote", Sole Survivor designation) is unaffected.
-- ============================================================

-- The winner-pick table and the season columns that configured/gated classic mode.
drop table if exists winner_picks;
alter table seasons drop column if exists winner_mode;
alter table seasons drop column if exists winner_lock_episode;

-- Classic-only outcome score types, from both the template and every per-season
-- snapshot. Sole Survivor scores placements via made_final_tribal / runner_up /
-- sole_survivor_win instead; the finale winner vote (correct_winner_vote) stays.
delete from prediction_score_types where key in (
  'winner_sole_survivor', 'winner_runner_up', 'winner_2nd_runner_up',
  'roster_placement_1', 'roster_placement_2', 'roster_placement_3'
);
delete from season_prediction_score_types where key in (
  'winner_sole_survivor', 'winner_runner_up', 'winner_2nd_runner_up',
  'roster_placement_1', 'roster_placement_2', 'roster_placement_3'
);
