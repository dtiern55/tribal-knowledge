-- Finishing 1st/2nd/3rd is something the CONTESTANT did, so it scores like
-- everything else a contestant does: a scoring event on the finale episode.
--
-- It used to be the one exception — `prediction_score_types` read live against
-- roster_picks by a parallel query (scoring._PLACEMENT_SQL), credited straight
-- to users and never touching the contestant. The winner's own score didn't
-- move when they won. Routing it through scoring_events fixes that, and the
-- roster join already credits exactly whoever held the pick that episode, so
-- the same players are paid. Sole Survivor doubling comes free: finale events
-- are already x2 for the designee.
--
-- `sole_survivor_win` is renamed `won_season` on the way through. It never had
-- anything to do with the Sole Survivor *designation*, and sharing the name
-- made the two read as one rule.

insert into scoring_event_types (event_type, label, point_value, token_value, is_per_unit)
values
  ('made_final_tribal', 'Made final tribal', 10, 0, false),
  ('runner_up',         'Runner-up',         10, 0, false),
  ('won_season',        'Won the season',    20, 0, false)
on conflict (event_type) do nothing;

-- Per-season snapshots keep whatever that season configured the prediction
-- values as, so a season with tuned values keeps them.
insert into season_scoring_event_types
    (season_id, event_type, label, point_value, postmerge_point_value,
     token_value, is_per_unit)
select spst.season_id,
       case spst.key when 'sole_survivor_win' then 'won_season' else spst.key end,
       case spst.key
         when 'made_final_tribal' then 'Made final tribal'
         when 'runner_up'         then 'Runner-up'
         else 'Won the season'
       end,
       spst.point_value, null, 0, false
from season_prediction_score_types spst
where spst.key in ('made_final_tribal', 'runner_up', 'sole_survivor_win')
on conflict (season_id, event_type) do nothing;

-- Carry existing placements over to the new representation, so seasons that
-- already finished still score the same.
insert into scoring_events (episode_id, contestant_id, event_type, quantity, notes)
select fin.id, c.id, t.event_type, 1, 'placement'
from contestants c
join episodes fin on fin.season_id = c.season_id and fin.is_finale = true
join lateral (
  select unnest(
    case c.placement
      when 1 then array['made_final_tribal', 'won_season']
      when 2 then array['made_final_tribal', 'runner_up']
      when 3 then array['made_final_tribal']
      else array[]::text[]
    end
  ) as event_type
) t on true
where c.placement in (1, 2, 3)
  and not exists (
    select 1 from scoring_events se
    where se.episode_id = fin.id and se.contestant_id = c.id
      and se.event_type = t.event_type
  );

-- These are no longer predictions.
delete from season_prediction_score_types
 where key in ('made_final_tribal', 'runner_up', 'sole_survivor_win');
delete from prediction_score_types
 where key in ('made_final_tribal', 'runner_up', 'sole_survivor_win');
