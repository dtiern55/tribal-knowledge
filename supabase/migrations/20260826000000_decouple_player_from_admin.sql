-- #471: is_admin was doing double duty — granting admin tooling AND marking a
-- profile as a non-player. Every standings/scoring/token query filtered
-- `not is_admin`, so the moment a real player was made admin they vanished from
-- the standings and stopped being scored.
--
-- Split the concerns: is_admin stays tooling-only; is_player marks league
-- participation. A commissioner can now hold admin access and still be a
-- rostered, scored player.
alter table profiles add column if not exists is_player boolean not null default true;

-- Preserve current behaviour at migration time: the only accounts excluded from
-- the league today are the admin service accounts (e.g. Producer), so mark those
-- as non-players. New members default to is_player = true.
update profiles set is_player = false where is_admin;
