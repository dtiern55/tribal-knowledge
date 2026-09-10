-- Power Vote pays 30 before the merge and 35 after (was 28 / 32, #745).
-- Danny nudged it back up 2026-09-10. Seasons still in play take the new
-- value; finished seasons keep their snapshot.

update prediction_score_types
   set point_value = 30, postmerge_point_value = 35
 where key = 'power_vote';

update season_prediction_score_types x
   set point_value = 30, postmerge_point_value = 35
  from seasons s
 where x.season_id = s.id
   and x.key = 'power_vote'
   and s.status <> 'completed';
