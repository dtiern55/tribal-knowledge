-- Power Vote pays 28 before the merge and 32 after (was 36 / 40, #702).
-- Danny lowered it 2026-09-09 after three scored episodes of Blood vs. Water.
-- At 36 one hit paid 1.8x the top rung, exactly rung 1 + rung 2 together, and
-- about 1.7 episodes of average roster scoring — the ladder was fine, the
-- advantage on top of it was not. 28 keeps it clearly worth playing at 1.4x
-- the top rung. The #702 raise came from a David vs. Goliath simulation where
-- the Power Vote lost to the roster route; live play said the opposite.
-- Seasons still in play take the new value; finished seasons keep their
-- snapshot.

update prediction_score_types
   set point_value = 28, postmerge_point_value = 32
 where key = 'power_vote';

update season_prediction_score_types x
   set point_value = 28, postmerge_point_value = 32
  from seasons s
 where x.season_id = s.id
   and x.key = 'power_vote'
   and s.status <> 'completed';
