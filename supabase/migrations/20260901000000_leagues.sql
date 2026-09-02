-- Leagues (#595): a friend group with its own join code and members. The
-- single-row league_settings table was the seed of this ("a future
-- multi-league system would naturally grow this into a join_code column
-- per row of a leagues table"); that future is now. Every existing player
-- becomes a member of the first league, which inherits the current code.

create table leagues (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  join_code  text        not null unique,
  created_at timestamptz not null default now()
);

create table league_members (
  league_id  uuid        not null references leagues(id) on delete cascade,
  user_id    uuid        not null references profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (league_id, user_id)
);

alter table leagues enable row level security;
alter table league_members enable row level security;

insert into leagues (name, join_code)
select 'Snakes and Rats', join_code from league_settings limit 1;

insert into league_members (league_id, user_id)
select l.id, p.id from leagues l, profiles p where p.is_player;

drop table league_settings;
