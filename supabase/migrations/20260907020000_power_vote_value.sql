-- Power Vote pays 36 before the merge and 40 after (was 32 / 38, #694).
-- Danny raised it 2026-09-07 after seeing the ladder in play. Seasons still
-- in play take the new value; finished seasons keep their snapshot.

update prediction_score_types
   set point_value = 36, postmerge_point_value = 40
 where key = 'power_vote';

update season_prediction_score_types x
   set point_value = 36, postmerge_point_value = 40
  from seasons s
 where x.season_id = s.id
   and x.key = 'power_vote'
   and s.status <> 'completed';
