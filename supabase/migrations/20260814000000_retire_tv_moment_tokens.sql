-- ============================================================
-- Step 1 of retiring tokens (#307): television moments off, gameplay token
-- events converted to points.
--
-- Tokens are going away as a currency (one free advantage play per week
-- replaces buying), which leaves every token-only event paying nothing.
-- Nothing is deleted — retired types keep their rows and all their history,
-- the same `enabled = false` pattern advantage_types has used since #12.
--
-- TELEVISION MOMENTS DIE. Tokens were their only home and principle 7 forbids
-- paying them points. Also removes four judgment calls per episode from the
-- Friday scoring job.
--
-- GAMEPLAY EVENTS CONVERT TO POINTS. They only ever paid tokens because
-- tokens existed; principle 7 says gameplay earns points. All five fired just
-- 2 times across three complete seasons, so these values set the feel of a
-- rare moment rather than affecting balance. Priced against the existing
-- scale (idol save 20, individual immunity 15, acquire active idol 10,
-- blindside 7, acquire extra vote 6).
--
-- The Extra Vote ADVANTAGE is not touched here. It only stops making sense
-- once the weekly play lands (step 2); retiring it while tokens still buy
-- advantages would leave the game with two purchasable options and a live
-- economy. It goes with the mechanic that replaces it.
--
-- Completed seasons snapshot their own config at creation, so Cagayan, S49
-- and S50 keep scoring exactly as they do now (#170).
-- ============================================================

alter table scoring_event_types
  add column enabled boolean not null default true;

alter table season_scoring_event_types
  add column enabled boolean not null default true;

-- Television moments: retired, rows and history kept.
update scoring_event_types set enabled = false
where event_type in ('background_story_aired', 'survivor_moment',
                     'cry_on_camera', 'cuss_on_camera');

-- Gameplay events: tokens -> points.
update scoring_event_types set point_value = 15, token_value = 0
where event_type in ('steal_immunity_idol', 'play_idol_nullifier');

update scoring_event_types set point_value = 12, token_value = 0
where event_type = 'fake_idol_played';

update scoring_event_types set point_value = 8, token_value = 0
where event_type = 'use_steal_a_vote';

update scoring_event_types set point_value = 6, token_value = 0
where event_type = 'use_extra_vote';
