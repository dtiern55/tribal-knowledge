-- ============================================================
-- One advantage play per player per episode (#307, steps 2 and 3).
--
-- The token economy is replaced by a weekly allowance: every player gets
-- exactly one play each episode, no cost, no inventory, use it or lose it.
-- Spend it on Double Roster Points, Double Vote Points, or an extra roster
-- swap. Nothing to buy, no balances, no saving up.
--
-- Extra Vote retires here rather than in the previous migration: while tokens
-- still bought advantages, removing one of three purchasable options would
-- have left the game incoherent. Under one-play-per-week it is worth ~5.7
-- against ~10 for both doubles, so it is dominated in every phase. Kept, not
-- deleted — its value is concentrated in weeks where the vote is readably
-- down to three or four people, which is worth re-measuring with human picks.
--
-- NO UNIQUE CONSTRAINT for the one-play rule: 64 user-episodes across the
-- practice seasons already carry multiple plays (Cagayan bots alone account
-- for 56), so the index could not be created and back-filling would rewrite
-- finished seasons (#170). The rule is enforced in the play endpoint under
-- the same user/season advisory lock that already serializes double-spends.
--
-- seasons.max_swaps is now vestigial. Swaps are capped by the weekly play
-- instead — you can swap as often as you like, but each one past the free
-- one costs you that week's advantage. The column stays so completed seasons
-- keep their configuration on record.
-- ============================================================

update advantage_types set enabled = false
where advantage_type = 'extra_vote';

-- Tokens buy nothing now. Zero the default so a new season never grants an
-- allowance; existing seasons keep their configured value as a record.
alter table seasons alter column weekly_token_allocation set default 0;
