-- Sole Survivor mode (#164): new seasons designate a rostered contestant
-- whose finale-episode contribution is doubled, replacing the classic
-- winner pick. Existing seasons stay classic (time capsule, #170).

alter table seasons add column winner_mode text not null default 'classic'
  check (winner_mode in ('classic', 'sole_survivor'));
alter table seasons alter column winner_mode set default 'sole_survivor';

-- Designation lock; null falls back to swap_lock_episode, then merge + 2.
alter table seasons add column ss_lock_episode int;

alter table roster_picks add column is_sole_survivor boolean not null default false;
-- One designation per user per season, ever; pre-lock re-designation clears
-- the old flag first.
create unique index roster_picks_one_ss
  on roster_picks (user_id, season_id) where is_sole_survivor;

-- Additive finale placement values, template + every season snapshot (the
-- classic keys stay everywhere too — winner_mode decides which set scores).
insert into prediction_score_types (key, label, point_value, postmerge_point_value)
values
  ('made_final_tribal', 'Made final tribal', 10, null),
  ('runner_up',         'Runner-up',         10, null),
  ('sole_survivor_win', 'Sole Survivor',     20, null);

insert into season_prediction_score_types
    (season_id, key, label, point_value, postmerge_point_value)
select s.id, pst.key, pst.label, pst.point_value, pst.postmerge_point_value
from seasons s
join prediction_score_types pst
  on pst.key in ('made_final_tribal', 'runner_up', 'sole_survivor_win')
on conflict do nothing;
