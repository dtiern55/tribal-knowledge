-- Durable, owner-scoped progress through the automatic My Season reveal (#331).
-- One row is enough: missed weeks intentionally jump to the latest scored
-- playable episode, while history replay never writes here.
create table reveal_acknowledgements (
    user_id uuid not null references profiles(id) on delete cascade,
    season_id uuid not null references seasons(id) on delete cascade,
    episode_id uuid not null references episodes(id) on delete cascade,
    acknowledged_at timestamptz not null default now(),
    primary key (user_id, season_id)
);

alter table reveal_acknowledgements enable row level security;

create policy "Players can read their reveal acknowledgement"
on reveal_acknowledgements for select
using (auth.uid() = user_id);

create policy "Players can create their reveal acknowledgement"
on reveal_acknowledgements for insert
with check (auth.uid() = user_id);

create policy "Players can advance their reveal acknowledgement"
on reveal_acknowledgements for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Do not surprise players by auto-opening old results on rollout. Completed
-- seasons are time capsules, so mark each participant through that season's
-- latest scored playable episode. Explicit history replay remains available.
insert into reveal_acknowledgements (user_id, season_id, episode_id)
select distinct rp.user_id, s.id, latest.id
from seasons s
join roster_picks rp on rp.season_id = s.id
cross join lateral (
    select ep.id
    from episodes ep
    where ep.season_id = s.id
      and ep.status = 'scored'
      and s.roster_lock_episode is not null
      and ep.episode_number >= s.roster_lock_episode
    order by ep.episode_number desc
    limit 1
) latest
where s.status = 'completed';
