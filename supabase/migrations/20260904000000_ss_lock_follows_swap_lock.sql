-- Sole Survivor designation locks with the swaps (2026-09-03): no separate
-- knob, so the two can never drift apart. The effective lock is
-- swap_lock_episode, else merge_episode + 3.
alter table league_seasons drop column ss_lock_episode;
