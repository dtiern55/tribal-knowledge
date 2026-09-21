-- The finale paid too much, and "runner-up" is not a thing we score (#881).
--
-- Season 270's finale paid the median team 146 against 49 in a normal week,
-- three times a normal week, and the best team 375. Placement drops from
-- 80/50/30 to 65/25/25: made_final_tribal 30 -> 25, won_season 50 -> 40.
-- The Sole Survivor bonus stays at +50%; it is what players cheer for, and it
-- only moves teams that designated a finalist.
--
-- runner_up is retired. Making the final tribal IS the achievement — sometimes
-- the final is two people, and which loser is "2nd" comes down to jury votes we
-- don't score. Nothing else in the system distinguishes 2nd from 3rd:
-- scoring.finale_actuals reads placements 1-3 as a set, 1-4 as a set, and 1 as
-- the winner. Retired the way the TV moments were (#307), so completed seasons
-- keep rendering theirs.

update scoring_event_types set point_value = 25 where event_type = 'made_final_tribal';
update scoring_event_types set point_value = 40 where event_type = 'won_season';
update scoring_event_types set enabled = false where event_type = 'runner_up';

-- Seasons still in play take the new rule; completed seasons are time
-- capsules (#170).
update season_scoring_event_types x set point_value = 25
  from seasons s
 where x.season_id = s.id and s.status <> 'completed'
   and x.event_type = 'made_final_tribal';

update season_scoring_event_types x set point_value = 40
  from seasons s
 where x.season_id = s.id and s.status <> 'completed'
   and x.event_type = 'won_season';

update season_scoring_event_types x set enabled = false
  from seasons s
 where x.season_id = s.id and s.status <> 'completed'
   and x.event_type = 'runner_up';

-- Placement 2 stops minting a runner_up event. The delete still names it, so
-- re-syncing a placement clears rows minted before this migration.
create or replace function sync_placement_events() returns trigger as $$
declare
  finale_id uuid;
  ev text;
begin
  select id into finale_id from episodes
   where season_id = new.season_id and is_finale = true
   limit 1;
  if finale_id is null then
    return new;  -- no finale yet; nothing to attach them to
  end if;

  delete from scoring_events
   where episode_id = finale_id
     and contestant_id = new.id
     and event_type in ('made_final_tribal', 'runner_up', 'won_season');

  foreach ev in array (
    case new.placement
      when 1 then array['made_final_tribal', 'won_season']
      when 2 then array['made_final_tribal']
      when 3 then array['made_final_tribal']
      else array[]::text[]
    end
  ) loop
    insert into scoring_events (episode_id, contestant_id, event_type, quantity, notes)
    values (finale_id, new.id, ev, 1, 'placement');
  end loop;

  return new;
end;
$$ language plpgsql;

-- Clear runner_up rows already minted in seasons still in play. Completed
-- seasons keep theirs, alongside the snapshot value that still scores them.
delete from scoring_events se
 using episodes ep, seasons s
 where se.episode_id = ep.id and ep.season_id = s.id
   and s.status <> 'completed'
   and se.event_type = 'runner_up';
