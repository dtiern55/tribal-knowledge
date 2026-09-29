-- A player's real name beside their team name (display_name), so standings say
-- who is behind a made-up team name. Nullable: players who joined before this
-- have none until the commissioner or they fill it in.
alter table profiles add column real_name text;
