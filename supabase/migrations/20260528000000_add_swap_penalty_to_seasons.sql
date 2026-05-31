-- ============================================================
-- Add configurable roster-swap penalty to seasons.
-- Previously hardcoded as -20 in the API (MYP baseline).
--
-- seasons.swap_penalty_points  = the configured penalty for this
--                                season (<= 0), applied on each swap.
-- roster_picks.swap_penalty_points = the value actually applied to a
--                                pick when it is closed by a swap.
-- ============================================================
alter table seasons
  add column swap_penalty_points int not null default -20
    check (swap_penalty_points <= 0);
