-- ============================================================
-- Roster placement points (issue #87, DECISION 2026-07-17).
--
-- A contestant finishing 1st/2nd/3rd earns ROSTER points for whoever
-- rosters them at the finale (+30 / +20 / +10). This is separate from the
-- winner-PICK prediction game (winner_sole_survivor etc. in this same
-- table) — those credit whoever *predicted* the winner, not the rosterer.
--
-- App-computed from contestants.placement, never manually entered, so it
-- lives in prediction_score_types like the other outcome values. Single
-- rate (finale-only), so postmerge_point_value is NULL.
-- ============================================================
insert into prediction_score_types
    (key, label, point_value, postmerge_point_value)
values
  ('roster_placement_1', 'Rostered contestant wins Sole Survivor', 30, null),
  ('roster_placement_2', 'Rostered contestant is runner-up',       20, null),
  ('roster_placement_3', 'Rostered contestant is 2nd runner-up',   10, null);
