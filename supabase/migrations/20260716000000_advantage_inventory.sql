-- ============================================================
-- Buy → hold → use advantages (issue #47).
-- An advantage_plays row is an owned advantage object:
--   episode_id null  = bought, sitting in the player's inventory
--   episode_id set   = used in that episode (scoring keys off this)
-- Tokens are spent at purchase. Using is free and reversible until the
-- episode locks. The (user_id, episode_id, advantage_type) unique
-- constraint still enforces once-per-type-per-episode at use time;
-- null episode_ids don't collide, so stockpiling unused copies works.
-- season_id is needed directly now that inventory rows have no episode.
-- ============================================================

alter table advantage_plays
  add column season_id uuid references seasons(id) on delete cascade;

update advantage_plays ap
   set season_id = e.season_id
  from episodes e
 where e.id = ap.episode_id;

alter table advantage_plays
  alter column season_id set not null,
  alter column episode_id drop not null;
