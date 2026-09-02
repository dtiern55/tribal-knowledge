-- Practice seasons (#265): a sandbox season run alongside the live one.
-- Hidden from non-admin players entirely, and the only kind of season the
-- bot driver will write to. Every season to date was a practice run, so all
-- existing rows are flagged; the first real league season is created fresh.
alter table seasons add column practice boolean not null default false;
update seasons set practice = true;
