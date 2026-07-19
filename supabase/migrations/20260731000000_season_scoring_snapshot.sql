-- #170: completed seasons are time capsules. Scoring config becomes a
-- per-season snapshot taken at season creation; the global tables stay as
-- the template for future seasons. Backfill copies today's globals into
-- every existing season — the closest available approximation of the values
-- they were played under.

create table season_scoring_event_types (
  season_id             uuid    not null references seasons(id) on delete cascade,
  event_type            text    not null,
  label                 text    not null,
  point_value           int     not null default 0,
  postmerge_point_value int,
  token_value           int     not null default 0,
  is_per_unit           boolean not null default false,
  primary key (season_id, event_type)
);

create table season_prediction_score_types (
  season_id             uuid not null references seasons(id) on delete cascade,
  key                   text not null,
  label                 text not null,
  point_value           int  not null,
  postmerge_point_value int,
  primary key (season_id, key)
);

alter table season_scoring_event_types enable row level security;
alter table season_prediction_score_types enable row level security;

insert into season_scoring_event_types
    (season_id, event_type, label, point_value, postmerge_point_value,
     token_value, is_per_unit)
select s.id, et.event_type, et.label, et.point_value, et.postmerge_point_value,
       et.token_value, et.is_per_unit
from seasons s cross join scoring_event_types et;

insert into season_prediction_score_types
    (season_id, key, label, point_value, postmerge_point_value)
select s.id, pst.key, pst.label, pst.point_value, pst.postmerge_point_value
from seasons s cross join prediction_score_types pst;
