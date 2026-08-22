-- Display nickname for contestants (e.g. "Coach" for Benjamin Wade, "Christian"
-- for Christian Hubicki). Nullable: null means use the full name. Display reads
-- coalesce(nickname, name); the full legal name stays in `name` for the profile
-- and admin editing. No uniqueness — two "Christian"s are fine.
alter table contestants add column nickname text;
