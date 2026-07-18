-- ============================================================
-- One placement per season (issue #112).
-- Placement drives winner (+100) and roster-placement points; a duplicate
-- (admin typo) silently double-awards both. The API pre-checks for a clear
-- 409; this index is the backstop that makes the corruption impossible.
-- Verified against prod before creation: no existing duplicates.
-- ============================================================

create unique index contestants_one_placement_per_season
  on contestants (season_id, placement)
  where placement is not null;
