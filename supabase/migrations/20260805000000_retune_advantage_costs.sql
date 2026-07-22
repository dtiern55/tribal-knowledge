-- ============================================================
-- Retune advantage buy costs (values locked in for the practice season, per
-- decision 2026-07-22). advantage_types is global — the practice season is the
-- only one live — so this is effectively a this-season change and the new
-- going-forward defaults.
--
--   Extra Vote            20 -> 5
--   Double Roster Points  15 -> 20
--   Double Vote Points    unchanged (10)
--
-- Also reprices advantages ALREADY bought at the old cost and reconciles the
-- token ledger, so balances reflect the corrected prices. A heavy Double Roster
-- buyer's balance may go slightly negative — accepted (test season).
-- ============================================================

update advantage_types set token_cost = 5  where advantage_type = 'extra_vote';
update advantage_types set token_cost = 20 where advantage_type = 'double_roster_points';

-- Reconcile the spend ledger entry for each already-bought unit to the new
-- cost. Runs after the updates above, so it reads the corrected token_cost.
update token_transactions tt
set amount = -at.token_cost
from advantage_plays ap
join advantage_types at on at.advantage_type = ap.advantage_type
where tt.advantage_play_id = ap.id
  and tt.transaction_type = 'advantage_spend'
  and ap.advantage_type in ('extra_vote', 'double_roster_points');

-- ...and the cost stamped on the play itself (shown in Play History).
update advantage_plays ap
set token_cost = at.token_cost
from advantage_types at
where at.advantage_type = ap.advantage_type
  and ap.advantage_type in ('extra_vote', 'double_roster_points');
