-- ============================================================
-- Roster Swap becomes a bought-then-used advantage (issue #202).
-- A roster_swap advantage_plays row is a swap credit:
--   episode_id null  = bought, waiting in inventory
--   episode_id set   = spent on the swap that closed a roster pick
-- Tokens are charged at purchase (via the normal buy endpoint), so the
-- swap endpoint just consumes a credit. Pricing stays per-season
-- (seasons.free_swaps / swap_token_cost / max_swaps), so roster_swap is
-- deliberately NOT a row in advantage_types (that table's cost is flat).
-- ============================================================

alter table advantage_plays
  drop constraint advantage_plays_advantage_type_check;

alter table advantage_plays
  add constraint advantage_plays_advantage_type_check
    check (advantage_type in (
      'double_roster_points',
      'double_vote_points',
      'extra_vote',
      'roster_swap'
    ));
