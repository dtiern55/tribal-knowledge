-- #381 follow-up: adopt the refreshed scoring in the season already underway.
--
-- 20260819 retuned the global templates only, so David vs. Goliath kept the
-- snapshot taken at creation and had no way to record the seven event types
-- that came with it. Completed seasons stay time capsules (#170); an active
-- season is still being played, so it takes the current rules.
--
-- Scores recompute live from these values, so episodes already scored pick the
-- change up on read. The only retroactive movement is correct_elimination
-- 15 -> 16: nothing else recorded in DvG's first three episodes changed value.

insert into season_scoring_event_types
    (season_id, event_type, label, point_value, postmerge_point_value,
     token_value, is_per_unit, enabled)
select s.id, et.event_type, et.label, et.point_value, et.postmerge_point_value,
       et.token_value, et.is_per_unit, et.enabled
from seasons s cross join scoring_event_types et
where s.status = 'active'
on conflict (season_id, event_type) do update set
  label = excluded.label,
  point_value = excluded.point_value,
  postmerge_point_value = excluded.postmerge_point_value,
  token_value = excluded.token_value,
  is_per_unit = excluded.is_per_unit,
  enabled = excluded.enabled;

insert into season_prediction_score_types
    (season_id, key, label, point_value, postmerge_point_value)
select s.id, pst.key, pst.label, pst.point_value, pst.postmerge_point_value
from seasons s cross join prediction_score_types pst
where s.status = 'active'
on conflict (season_id, key) do update set
  label = excluded.label,
  point_value = excluded.point_value,
  postmerge_point_value = excluded.postmerge_point_value;
