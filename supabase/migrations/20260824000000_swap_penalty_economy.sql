-- ============================================================
-- Roster swap becomes its own economy (decision #403, issue #404).
--
-- The swap leaves the weekly-play economy: it no longer spends the
-- week's advantage play, and the doubles no longer block it. Instead
-- it is rate-limited (one per episode, until swap_lock_episode) and
-- priced in points again.
--
-- Cost of the Nth swap of the season:
--   N <= free_swaps            -> 0
--   otherwise                  -> max(swap_penalty_step * N, swap_penalty_floor)
--
-- With the defaults (free_swaps 1, step -5, floor -25) that is
-- free, -10, -15, -20, -25, then -25 for every swap after.
--
-- This reverses the 2026-07-18 decision that moved the cost out of
-- points and into tokens ("feels worse than docking standings"). The
-- token economy that justified it is itself retired (#307), so the
-- comparison was never re-run against the weekly-play alternative.
--
-- roster_picks.swap_penalty_points is UNCHANGED and needs no backfill:
-- it already exists, scoring already sums it into standings and
-- attributes it to the dropped castaway, and episode results already
-- book it. It has simply been written as 0 since the token era. Old
-- rows keep whatever they hold — completed seasons are time capsules
-- (#170).
-- ============================================================

alter table seasons
  add column swap_penalty_step int not null default -5
    check (swap_penalty_step <= 0),
  add column swap_penalty_floor int not null default -25
    check (swap_penalty_floor <= 0);

comment on column seasons.swap_penalty_step is
  'Escalating swap cost: the Nth charged swap costs step * N, floored at '
  'swap_penalty_floor. Negative.';
comment on column seasons.swap_penalty_floor is
  'Most any single swap can cost. Negative.';

-- Vestigial since #307 — the play cost was the cap, and now the
-- escalating penalty is. roster.py has ignored it since.
alter table seasons drop column max_swaps;
