-- ============================================================
-- Roster swap limits (issue #84, DECISION 2026-07-17).
--
-- max_swaps          = hard cap on true mid-season swaps per player per
--                      season (default 3). Free pre-lock roster rearranging
--                      is a full re-submit, not a swap, so it never counts.
-- swap_lock_episode  = swaps are disabled from this episode onward (a few
--                      episodes after the merge, set per season). NULL = no
--                      late-game lock.
-- ============================================================
alter table seasons
  add column max_swaps int not null default 3 check (max_swaps >= 0),
  add column swap_lock_episode int check (swap_lock_episode > 0);
