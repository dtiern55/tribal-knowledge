-- ============================================================
-- Swaps cost tokens, not points (decision 2026-07-18, with #14/#15).
-- The -20 point penalty was inherited MYP baseline; moving the
-- opportunity cost into the token economy simplifies scoring and
-- feels better than docking standings. Flat per-season cost for now;
-- a sliding scale (30/50/70...) is a future option if tuning wants it.
--
-- roster_picks.swap_penalty_points is KEPT: it is the historical
-- record that completed seasons' standings are computed from. New
-- swaps simply leave it at its default 0.
-- ============================================================

alter table seasons drop column swap_penalty_points;

alter table seasons
  add column swap_token_cost int not null default 30
    check (swap_token_cost >= 0);

alter table token_transactions
  drop constraint token_transactions_transaction_type_check;
alter table token_transactions
  add constraint token_transactions_transaction_type_check
    check (transaction_type in (
      'starting_allocation',
      'weekly_allocation',
      'gameplay_event',
      'television_moment',
      'advantage_spend',
      'roster_swap'
    ));
