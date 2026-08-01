-- Winning should feel like winning.
--
-- Placement totals go 30/20/10 -> 80/50/30 (1st/2nd/3rd). The values stack:
-- made_final_tribal pays all three finishers, then runner_up or won_season on
-- top, so the components are 30 / +20 / +50.
--
-- Sole Survivor drops from x2 to +50%. With placement nearly tripled that is
-- still a bigger swing than doubling used to be (designating the winner was
-- worth +30, now +40), which is the point — the multiplier shrinks so the
-- bigger placement pot doesn't run away with the season.

update scoring_event_types set point_value = 30 where event_type = 'made_final_tribal';
update scoring_event_types set point_value = 20 where event_type = 'runner_up';
update scoring_event_types set point_value = 50 where event_type = 'won_season';

update season_scoring_event_types set point_value = 30 where event_type = 'made_final_tribal';
update season_scoring_event_types set point_value = 20 where event_type = 'runner_up';
update season_scoring_event_types set point_value = 50 where event_type = 'won_season';
