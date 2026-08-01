-- "Sole Survivor" was two different things in one app.
--
-- The prediction key `sole_survivor_win` pays for having the season's WINNER
-- on your roster at the finale — it has nothing to do with the Sole Survivor
-- *designation* (roster_picks.is_sole_survivor), which is a x2 multiplier on
-- that designee's finale contribution. The Rules page showed a row reading
-- "Sole Survivor  20" directly under a heading about the designation, so the
-- two read as one rule.
--
-- Point values are unchanged; this is a label only. Completed seasons keep
-- their snapshot wording (#170 time capsules).

update prediction_score_types
   set label = 'Rostered the season winner'
 where key = 'sole_survivor_win';

update season_prediction_score_types spst
   set label = 'Rostered the season winner'
  from seasons s
 where s.id = spst.season_id
   and s.status <> 'completed'
   and spst.key = 'sole_survivor_win';
