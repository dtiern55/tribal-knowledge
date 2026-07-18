-- ============================================================
-- Configurable advantage cutoff (extends issue #85).
--
-- Originally advantages + weekly-token earning stopped at the finale. This
-- makes the cutoff a per-season setting: from advantage_lock_episode onward,
-- advantages can't be played and scoring an episode grants no weekly tokens.
-- NULL keeps the original behaviour (cutoff = the finale episode).
-- ============================================================
alter table seasons
  add column advantage_lock_episode int check (advantage_lock_episode > 0);
