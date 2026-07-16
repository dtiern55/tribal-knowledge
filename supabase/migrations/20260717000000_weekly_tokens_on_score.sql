-- ============================================================
-- Weekly token allocation folds into episode scoring (issue #49).
-- Scoring an episode automatically grants every player the season's
-- weekly_token_allocation — the manual weekly-allocation endpoint stays
-- for corrections only. Per-season and tunable like the rest of the
-- token economy; 0 disables the automatic grant.
-- ============================================================

alter table seasons
  add column weekly_token_allocation int not null default 10
    check (weekly_token_allocation >= 0);
