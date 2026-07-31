-- TV-moment token events pay per occurrence, not a flat rate.
--
-- These were seeded flat on the assumption of "at most one per contestant per
-- episode" (#14). In practice a castaway cusses three times in an episode and
-- the commissioner records quantity 3 — the quantity was stored but ignored,
-- so three cusses paid the same as one. Quantity now means quantity; a genuine
-- one-off is just quantity 1 and pays exactly what it did before.
--
-- Completed seasons keep their snapshot untouched: they were played under the
-- flat rule and #170 exists to preserve that.

update scoring_event_types
   set is_per_unit = true
 where event_type in (
   'cuss_on_camera', 'cry_on_camera', 'survivor_moment', 'background_story_aired'
 );

update season_scoring_event_types sset
   set is_per_unit = true
  from seasons s
 where s.id = sset.season_id
   and s.status <> 'completed'
   and sset.event_type in (
     'cuss_on_camera', 'cry_on_camera', 'survivor_moment', 'background_story_aired'
   );
