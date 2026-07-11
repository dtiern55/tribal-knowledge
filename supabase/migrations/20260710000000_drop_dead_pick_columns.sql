-- ============================================================
-- Drop columns nothing writes (2026-07-10 audit).
--
-- elimination_picks.is_doubled: never set to true — Double Vote Points is
-- detected by joining advantage_plays (app/scoring.py), which survives picks
-- being deleted and reinserted on resubmission. Dropping the column also
-- drops the partial unique index on it.
--
-- winner_picks.effective_episode: dead since decision #12 (2026-07-06) —
-- one winner pick per season, edited in place, no change history. Always
-- inserted as 1. Dropping it takes the old three-column unique with it;
-- (user_id, season_id) is the real key.
-- ============================================================

alter table elimination_picks drop column is_doubled;

alter table winner_picks drop column effective_episode;
alter table winner_picks add unique (user_id, season_id);
