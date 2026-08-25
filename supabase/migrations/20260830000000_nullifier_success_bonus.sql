-- #535: a landed idol nullifier scores more than a whiffed one.
--
-- `play_idol_nullifier` was a flat 15 whether it hit a real idol or nothing,
-- while an idol play splits into `play_idol` (10), `votes_blocked_by_idol`
-- (2 each) and `idol_played_successfully` (+5). Across the 61 seasons in
-- survivoR a successful idol play is worth a median of 23 points under our
-- scale; the nullifier's flat 15 sat well below that despite being the harder
-- read. Danny's ruling 2026-08-24: keep the 15 for the play, add +10 when it
-- actually nullifies, so a landed nullifier is 25 — the 75th percentile of a
-- successful idol play.
--
-- Global template only. Seasons snapshot at creation (#170), so this reaches
-- the next season created and leaves every existing snapshot alone.

insert into scoring_event_types
    (event_type, label, point_value, token_value, is_per_unit, enabled)
values
    ('nullifier_played_successfully', 'Idol nullifier voids a real idol', 10, 0, false, true)
on conflict (event_type) do update set
  label = excluded.label,
  point_value = excluded.point_value,
  enabled = excluded.enabled;
