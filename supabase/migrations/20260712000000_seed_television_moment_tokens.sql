-- ============================================================
-- Seed: television-moment token events (issue #14, placeholder list)
-- Goofy editorial/camera moments — tokens only, never points
-- (design principle 7: gameplay over television moments for points).
-- Values deliberately small vs gameplay token events (10-20): these
-- fire often, and the token economy already gets +10/week for free.
-- Logged flat (not per-unit): at most one per contestant per episode,
-- admin's judgment. Tune values directly in the table during the
-- practice season.
-- ============================================================
insert into scoring_event_types (event_type, label, point_value, token_value, is_per_unit) values
  ('background_story_aired',  'Personal background story aired',            0, 5, false),
  ('survivor_moment',         '"That''s how you do it on Survivor" moment', 0, 5, false),
  ('cry_on_camera',           'Cries on camera',                            0, 3, false),
  ('cuss_on_camera',          'Cusses on camera',                           0, 2, false);
