-- Ballot ladder (#694, 2026-09-07).
--
-- Ballot names are ranked by confidence and pay by rung; the Power Vote is
-- a fixed value on top instead of double one name. Values live in the
-- prediction snapshot like everything else, so a season without the rung
-- keys keeps flat scoring (#170 time capsules): a pick with no rank, or in a
-- season with no rung keys, pays `correct_elimination` as before.

alter table elimination_picks add column rank int;

-- One name per rung. The Power Vote's name has no rank: it is the play's
-- target, on top of the ladder.
create unique index elimination_picks_one_per_rank
  on elimination_picks (user_id, league_season_id, episode_id, rank)
  where rank is not null;

insert into prediction_score_types (key, label, point_value, postmerge_point_value)
values
  ('correct_elimination_1', 'Correct 1st pick', 20, 25),
  ('correct_elimination_2', 'Correct 2nd pick', 16, 20),
  ('correct_elimination_3', 'Correct 3rd pick', 12, 15),
  ('power_vote',            'Power Vote hits',   32, 38)
on conflict (key) do update set
  label = excluded.label,
  point_value = excluded.point_value,
  postmerge_point_value = excluded.postmerge_point_value;

-- Seasons still in play take the ladder now (practice and staging included);
-- finished seasons keep their snapshot as it was.
insert into season_prediction_score_types
    (season_id, key, label, point_value, postmerge_point_value)
select s.id, t.key, t.label, t.point_value, t.postmerge_point_value
from seasons s
cross join prediction_score_types t
where s.status <> 'completed'
  and t.key in ('correct_elimination_1', 'correct_elimination_2',
                'correct_elimination_3', 'power_vote')
  and not exists (
    select 1 from season_prediction_score_types x
    where x.season_id = s.id and x.key = t.key
  );
