-- A swap is the pair (incoming pick, the pick it closed). With the
-- one-swap-per-episode cap gone the pair has to be recorded, since an
-- undo can no longer find "the" swap of the episode by its close episode.
alter table roster_picks
  add column replaced_pick_id uuid references roster_picks(id) on delete set null;

-- Pair up swaps made under the cap: at most one per player per episode,
-- so the pick closed the episode before an incoming pick's start is its
-- partner. Pre-lock picks all start at the roster base and are skipped.
update roster_picks a
set replaced_pick_id = d.id
from roster_picks d
where a.replaced_pick_id is null
  and d.user_id = a.user_id
  and d.league_season_id = a.league_season_id
  and d.active_until_episode = a.active_from_episode - 1
  and a.active_from_episode > (
    select min(r.active_from_episode) from roster_picks r
    where r.user_id = a.user_id and r.league_season_id = a.league_season_id
  );
