-- #450: episode title, entered manually by the admin (no TVmaze auto-fetch).
-- Nullable — display falls back to "Episode N" alone until a title is set.

alter table episodes add column title text;
