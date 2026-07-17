-- ============================================================
-- Play multiple owned advantages per episode (issue #14/#73).
-- The old (user_id, episode_id, advantage_type) unique allowed only one
-- play of a type per episode. Add target_contestant_id so you can double
-- two DIFFERENT votes/roster contestants in one episode; NULLs are distinct
-- in Postgres unique constraints, so target-less advantages (extra_vote)
-- simply stack. Stacking two on the SAME target is still blocked.
-- ============================================================

alter table advantage_plays
  drop constraint advantage_plays_user_episode_type_key;

alter table advantage_plays
  add constraint advantage_plays_user_episode_type_target_key
    unique (user_id, episode_id, advantage_type, target_contestant_id);
