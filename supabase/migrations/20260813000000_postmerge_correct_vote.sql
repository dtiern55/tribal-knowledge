-- ============================================================
-- Correct votes at tribal are worth more after the merge: 3 -> 5 (#300).
--
-- vote_correctly_at_tribal is already the league's de-facto longevity
-- mechanic — you only bank it by being alive at tribal and reading the vote
-- right, and post-merge everyone votes every week. Measured across the
-- practice seasons, it is already the MAJORITY of what a deep-but-quiet
-- castaway earns (Cirie 65% of her score, Rizo 60%, Ozzy 59%, Jawan 52%),
-- which is why adding a separate per-episode survival event moved nothing:
-- it double-paid the same behaviour.
--
-- A post-merge vote is strictly harder than a pre-merge one (bigger field to
-- read, no tribe to hide in), so paying both +3 was the anomaly. This is also
-- the only merge escalation on the contestant side — correct_elimination
-- (15 -> 18) was previously the only pre/post split live anywhere.
--
-- Backtested at 5: 5-8% score inflation, 2-10 rank changes, winner unchanged
-- in all three completed seasons. Rosters that stay alive gain 3-8x what
-- early-boot rosters do. @4 is too quiet; @6 costs ~12% of a season's total
-- for two more rank changes.
--
-- Global template only. Seasons snapshot the config at creation
-- (database.snapshot_scoring_config), so Cagayan/S49/S50 keep scoring at 3
-- and only new seasons pick this up (#170).
-- ============================================================

update scoring_event_types set postmerge_point_value = 5
where event_type = 'vote_correctly_at_tribal';
