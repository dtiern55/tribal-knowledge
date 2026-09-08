-- Redemption Island scoring, round two (2026-09-08): winning a duel pays 4,
-- and coming back is worth 12 at the merge but 15 in the endgame. The two
-- returns are separate event types because the merge return lands in the
-- merge episode itself, which the pre/post-merge switch already counts as
-- post-merge, so postmerge_point_value cannot tell them apart.

insert into scoring_event_types
    (event_type, label, point_value, postmerge_point_value, token_value,
     is_per_unit, enabled)
values
    ('win_redemption_duel', 'Win a Redemption Island duel', 4, null, 0,
     false, true),
    ('return_from_redemption_endgame',
     'Return from Redemption Island in the endgame', 15, null, 0,
     false, true)
on conflict (event_type) do nothing;

update scoring_event_types
set label = 'Return from Redemption Island at the merge'
where event_type = 'return_from_redemption';

-- Active seasons take the new types and the relabel (completed ones stay
-- time capsules, #170).
insert into season_scoring_event_types
    (season_id, event_type, label, point_value, postmerge_point_value,
     token_value, is_per_unit, enabled)
select s.id, et.event_type, et.label, et.point_value, et.postmerge_point_value,
       et.token_value, et.is_per_unit, et.enabled
from seasons s cross join scoring_event_types et
where s.status = 'active'
  and et.event_type in ('win_redemption_duel', 'return_from_redemption_endgame')
on conflict (season_id, event_type) do nothing;

update season_scoring_event_types et
set label = 'Return from Redemption Island at the merge'
from seasons s
where s.id = et.season_id and s.status = 'active'
  and et.event_type = 'return_from_redemption';
