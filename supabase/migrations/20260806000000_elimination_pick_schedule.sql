-- ============================================================
-- Season-configurable elimination-pick schedule (#269).
--
-- Weekly votes shrink as the field shrinks. The tiers live on the season and
-- POST /seasons/{id}/episodes derives max_elimination_picks from them when the
-- caller omits it, so the schedule stops depending on someone remembering.
--
-- Shape: [{"from_episode": 2, "picks": 3}, {"from_episode": 6, "picks": 2}, ...]
-- — a tier applies from its episode until the next tier starts. Arbitrary
-- number of tiers, so jsonb rather than fixed columns. Empty = old behavior
-- (whatever the caller passes, falling back to 3).
-- ============================================================

alter table seasons
  add column elimination_pick_schedule jsonb not null default '[]'::jsonb;
