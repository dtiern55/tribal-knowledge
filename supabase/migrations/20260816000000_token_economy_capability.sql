-- Make the retired token rules an explicit per-season capability (#335).
-- Existing seasons with a nonzero weekly allowance used the token economy;
-- new/current-rule seasons default to the weekly-play model.
alter table seasons
  add column token_economy_enabled boolean not null default false;

update seasons
set token_economy_enabled = true
where weekly_token_allocation > 0;

comment on column seasons.token_economy_enabled is
  'True only for seasons governed by the historical token economy; false uses one weekly play per episode.';
