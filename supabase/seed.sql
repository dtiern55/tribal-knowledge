-- Practice season seed data.
-- Runs automatically after migrations on `supabase db reset` (local dev).
-- For cloud: paste into the Supabase SQL editor and run once.
--
-- Creates one active practice season with 18 placeholder contestants and
-- 5 episodes (3 already scored, 2 open). Rename contestants via the admin
-- panel or PATCH /contestants/{id} once that's built.

do $$
declare
  v_season_id uuid := gen_random_uuid();
  ep1_id      uuid := gen_random_uuid();
  ep2_id      uuid := gen_random_uuid();
  ep3_id      uuid := gen_random_uuid();
  ep4_id      uuid := gen_random_uuid();
  ep5_id      uuid := gen_random_uuid();
  c1_id       uuid;
  c2_id       uuid;
  c3_id       uuid;
begin

  -- ----------------------------------------------------------------
  -- Season
  -- ----------------------------------------------------------------
  insert into seasons
    (id, name, season_number, roster_size, roster_lock_episode,
     merge_episode, winner_lock_episode, swap_penalty_points, status)
  values
    (v_season_id, 'Survivor: Practice Island', 99, 5, 2, 9, 3, -20, 'active');

  -- ----------------------------------------------------------------
  -- Episodes: 1-3 scored (past), 4-5 open (future picks window)
  -- ----------------------------------------------------------------
  insert into episodes
    (id, season_id, episode_number, air_date, max_elimination_picks,
     is_finale, picks_lock_at, status)
  values
    (ep1_id, v_season_id, 1, '2026-02-05', 3, false,
     '2026-02-05 20:00:00-05', 'scored'),
    (ep2_id, v_season_id, 2, '2026-02-12', 3, false,
     '2026-02-12 20:00:00-05', 'scored'),
    (ep3_id, v_season_id, 3, '2026-02-19', 3, false,
     '2026-02-19 20:00:00-05', 'scored'),
    (ep4_id, v_season_id, 4, '2026-07-03', 3, false,
     now() + interval '5 days', 'upcoming'),
    (ep5_id, v_season_id, 5, '2026-07-10', 3, false,
     now() + interval '12 days', 'upcoming');

  -- ----------------------------------------------------------------
  -- Contestants (18 placeholders — rename once cast is known)
  -- ----------------------------------------------------------------
  insert into contestants (season_id, name) values
    (v_season_id, 'Castaway 01'),
    (v_season_id, 'Castaway 02'),
    (v_season_id, 'Castaway 03'),
    (v_season_id, 'Castaway 04'),
    (v_season_id, 'Castaway 05'),
    (v_season_id, 'Castaway 06'),
    (v_season_id, 'Castaway 07'),
    (v_season_id, 'Castaway 08'),
    (v_season_id, 'Castaway 09'),
    (v_season_id, 'Castaway 10'),
    (v_season_id, 'Castaway 11'),
    (v_season_id, 'Castaway 12'),
    (v_season_id, 'Castaway 13'),
    (v_season_id, 'Castaway 14'),
    (v_season_id, 'Castaway 15'),
    (v_season_id, 'Castaway 16'),
    (v_season_id, 'Castaway 17'),
    (v_season_id, 'Castaway 18');

  -- ----------------------------------------------------------------
  -- Eliminations for scored episodes
  -- One per episode so elimination-pick scoring has something to grade.
  -- ----------------------------------------------------------------
  select id into c1_id from contestants
    where contestants.season_id = v_season_id and contestants.name = 'Castaway 01';
  select id into c2_id from contestants
    where contestants.season_id = v_season_id and contestants.name = 'Castaway 02';
  select id into c3_id from contestants
    where contestants.season_id = v_season_id and contestants.name = 'Castaway 03';

  insert into eliminations (episode_id, contestant_id, elimination_type) values
    (ep1_id, c1_id, 'voted_out'),
    (ep2_id, c2_id, 'voted_out'),
    (ep3_id, c3_id, 'voted_out');

end $$;
