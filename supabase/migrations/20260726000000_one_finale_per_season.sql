-- ============================================================
-- At most one finale episode per season (issue #120).
-- Placement points (_PLACEMENT_SQL) and finale ballots join on
-- "the finale episode"; a second is_finale row would multiply both.
-- The API pre-checks for a clear 409; this is the backstop.
-- Verified against prod before creation: no season has two finales.
-- ============================================================

create unique index episodes_one_finale_per_season
  on episodes (season_id)
  where is_finale;
