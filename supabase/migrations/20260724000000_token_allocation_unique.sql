-- ============================================================
-- DB-level idempotency for token grants (issue #114).
-- The allocation endpoints guard with NOT EXISTS, which is read-then-act:
-- a concurrent retry or double-click can double-grant. These partial
-- unique indexes are the backstop; the inserts use ON CONFLICT DO NOTHING
-- so a lost race is a no-op instead of an error.
-- Verified against prod before creation: no existing duplicates.
-- ============================================================

create unique index token_tx_one_starting_allocation
  on token_transactions (user_id, season_id)
  where transaction_type = 'starting_allocation';

create unique index token_tx_one_weekly_allocation_per_episode
  on token_transactions (user_id, season_id, episode_id)
  where transaction_type = 'weekly_allocation';
