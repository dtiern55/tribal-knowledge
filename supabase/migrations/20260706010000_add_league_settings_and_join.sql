-- ============================================================
-- Self-serve signup (issue #41 -> #42): a Supabase Auth signup gets a
-- profiles row by POSTing a shared join code to /join, instead of an
-- admin inserting rows by hand or a trigger doing it silently.
--
-- league_settings holds that code as data (mirrors prediction_score_types
-- / advantage_types) so it's editable by an admin without a deploy.
--
-- Single row by convention: seeded here, nothing else ever inserts into
-- this table. A future multi-league system would naturally grow this into
-- a join_code column per row of a leagues table, but that is explicitly
-- not being built now (decision 2026-07-07).
-- ============================================================

create table league_settings (
  id          uuid        primary key default gen_random_uuid(),
  join_code   text        not null,
  updated_at  timestamptz not null default now()
);

insert into league_settings (join_code) values ('change-me');

alter table league_settings enable row level security;
