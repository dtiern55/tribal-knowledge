-- ============================================================
-- Votes received at tribal no longer costs points (decision 2026-07-18).
--
-- It was an MYP-baseline placeholder (issue #15, "Final values TBD") that
-- felt too punitive — you'd lose points because a rostered castaway drew
-- votes, something the fantasy player doesn't control. Kept as a 0-point
-- per-unit event so castaway pages can still show the vote count for context.
-- ============================================================
update scoring_event_types
set point_value = 0, postmerge_point_value = 0
where event_type = 'votes_received';
