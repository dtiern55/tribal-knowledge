-- Redemption Island seasons (#655): a tribal-council boot that does not end
-- the game. The ballot still scores against the voted-out row; being *out*
-- now means an elimination with is_final. Losing on the island is the
-- terminal row (redemption_loss); coming back scores return_from_redemption.

alter table eliminations
  add column is_final boolean not null default true;

alter table eliminations drop constraint eliminations_elimination_type_check;
alter table eliminations
  add constraint eliminations_elimination_type_check
  check (elimination_type in (
    'voted_out', 'medical_evacuation', 'quit', 'fire_making_loss',
    'redemption_loss'
  ));

-- The island is a tribe row so every badge, picker, and cast group shows it
-- without new UI; the flag keeps ballots from targeting its residents.
alter table tribes
  add column is_redemption boolean not null default false;

insert into scoring_event_types
    (event_type, label, point_value, postmerge_point_value, token_value,
     is_per_unit, enabled)
values
    ('return_from_redemption', 'Return from Redemption Island', 12, null, 0,
     false, true)
on conflict (event_type) do nothing;

-- Active seasons take the new type (completed ones stay time capsules, #170).
insert into season_scoring_event_types
    (season_id, event_type, label, point_value, postmerge_point_value,
     token_value, is_per_unit, enabled)
select s.id, et.event_type, et.label, et.point_value, et.postmerge_point_value,
       et.token_value, et.is_per_unit, et.enabled
from seasons s cross join scoring_event_types et
where s.status = 'active' and et.event_type = 'return_from_redemption'
on conflict (season_id, event_type) do nothing;
