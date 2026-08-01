-- Keep placement scoring events in step with contestants.placement.
--
-- The events are a derived copy of the placement column, and placement is
-- written from several places (the admin PATCH, the survivoR import, seed and
-- test fixtures, ad-hoc SQL). Maintaining them in the API layer only covers
-- the one path that remembers to call it; a trigger covers every writer,
-- including the ones that don't exist yet.

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
      when 2 then array['made_final_tribal', 'runner_up']
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

create trigger contestants_sync_placement_events
after insert or update of placement on contestants
for each row execute function sync_placement_events();

-- The other ordering: placements set before the finale row exists (importers
-- and fixtures do this) would find nothing to attach to. Re-sync the season's
-- placed contestants whenever an episode becomes the finale.
create or replace function sync_placement_events_for_finale() returns trigger as $$
begin
  if new.is_finale then
    update contestants set placement = placement
     where season_id = new.season_id and placement in (1, 2, 3);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger episodes_sync_placement_events
after insert or update of is_finale on episodes
for each row execute function sync_placement_events_for_finale();
