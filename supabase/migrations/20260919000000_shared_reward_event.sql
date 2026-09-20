-- Taken along on an individual reward.
--
-- An individual reward winner usually picks one or two people to come with
-- them. The winner already scores win_individual_reward; the guests scored
-- nothing. Worth 3, the same as voting correctly at tribal.
--
-- Not enforced as post-merge only: individual rewards only happen after the
-- merge anyway, and a pre-merge value of 0 would just be a dead row.

insert into scoring_event_types
    (event_type, label, point_value, postmerge_point_value, token_value,
     is_per_unit, enabled)
values
  ('taken_on_reward', 'Taken along on an individual reward', 3, null, 0, false, true)
on conflict (event_type) do update set
  label = excluded.label,
  point_value = excluded.point_value,
  postmerge_point_value = excluded.postmerge_point_value,
  token_value = excluded.token_value,
  is_per_unit = excluded.is_per_unit,
  enabled = excluded.enabled;

-- The season already being played takes the new rule (#381 precedent).
-- Completed seasons stay time capsules (#170), so only active ones.
insert into season_scoring_event_types
    (season_id, event_type, label, point_value, postmerge_point_value,
     token_value, is_per_unit, enabled)
select s.id, et.event_type, et.label, et.point_value, et.postmerge_point_value,
       et.token_value, et.is_per_unit, et.enabled
from seasons s cross join scoring_event_types et
where s.status = 'active' and et.event_type = 'taken_on_reward'
on conflict (season_id, event_type) do update set
  label = excluded.label,
  point_value = excluded.point_value,
  postmerge_point_value = excluded.postmerge_point_value,
  token_value = excluded.token_value,
  is_per_unit = excluded.is_per_unit,
  enabled = excluded.enabled;
