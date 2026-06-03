-- ============================================================
-- Scoring config for the live scoring engine.
--
-- 1. Add postmerge_point_value to scoring_event_types so an event can score
--    differently after the merge (decision #10). NULL = point_value applies
--    regardless. The engine derives pre/post from an episode's number vs
--    season.merge_episode (episode_number >= merge_episode is post-merge).
-- 2. Collapse votes_received_premerge / _postmerge into a single votes_received
--    event (-3 pre / -2 post). No scoring_events reference them yet.
-- 3. New prediction_score_types config table for user-prediction and
--    winner-pick outcomes (decision #9), same base + post-merge-override shape.
-- ============================================================

alter table scoring_event_types
  add column postmerge_point_value int;

delete from scoring_event_types
  where event_type in ('votes_received_premerge', 'votes_received_postmerge');

insert into scoring_event_types
    (event_type, label, point_value, postmerge_point_value, token_value, is_per_unit)
values
  ('votes_received', 'Votes received at tribal', -3, -2, 0, true);

-- ============================================================
-- prediction_score_types
-- Values the app computes (never manually entered): elimination/winner
-- predictions and winner-pick finale outcomes.
-- postmerge_point_value NULL = single rate (e.g. finale-only values).
-- ============================================================
create table prediction_score_types (
  key                    text        primary key,
  label                  text        not null,
  point_value            int         not null,
  postmerge_point_value  int,
  created_at             timestamptz not null default now()
);

insert into prediction_score_types
    (key, label, point_value, postmerge_point_value)
values
  ('correct_elimination',  'Correct elimination prediction',  15,   18),
  ('correct_winner_vote',  'Correct winner vote (finale)',    30, null),
  ('winner_sole_survivor', 'Winner pick wins Sole Survivor',  100, null),
  ('winner_runner_up',     'Winner pick is runner-up',        60, null),
  ('winner_2nd_runner_up', 'Winner pick is 2nd runner-up',    25, null),
  ('backup_sole_survivor', 'Backup pick wins Sole Survivor',  50, null);

alter table prediction_score_types enable row level security;
