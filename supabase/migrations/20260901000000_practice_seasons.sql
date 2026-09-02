-- Practice seasons (#265): a sandbox season run alongside the live one.
-- Hidden from non-admin players entirely, and the only kind of season the
-- bot driver will write to. Existing practice seasons are the 100+ range
-- (Practice Island etc.), which was only ever a numbering convention.
alter table seasons add column practice boolean not null default false;
update seasons set practice = true where season_number >= 100;
