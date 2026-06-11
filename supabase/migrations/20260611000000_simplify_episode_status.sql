-- Simplify episode status enum per decision #11.
-- picks_open/picks_locked are never set by the app — whether picks are
-- open is computed at request time from picks_lock_at. The only two
-- meaningful states are upcoming (not yet scored) and scored.
alter table episodes drop constraint episodes_status_check;
alter table episodes add constraint episodes_status_check
  check (status in ('upcoming', 'scored'));
