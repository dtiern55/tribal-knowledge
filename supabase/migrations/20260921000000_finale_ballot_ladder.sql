-- Finale ballot ladder (#884, 2026-09-21).
--
-- The bracket paid a flat rate per correct name (Final 4 x6, Final 3 x8) plus a
-- 12-point bonus for the exact Final 3. The finale opens with five or six left,
-- so a blind bracket returns about 3 of 4 and 2 of 3 — and that par bracket took
-- 34 of the 60 base points. Over half the pot for a guess.
--
-- Each correct name is now worth double the one before it:
--
--   Final 4     2 / 4 / 8 / 16   (cumulative  2 ·  6 · 14 · 30)
--   Final 3    10 / 20 / 40      (cumulative 10 · 30 · 70)
--   Winner     60                (was 40)
--
-- The ceiling goes 100 -> 160 and par goes 74 -> 104, so the gap between a
-- well-read ballot and a guessed one widens from 26 to 56. That gap is the
-- whole point: it is what lets someone whose tribe has collapsed and whose Sole
-- Survivor is already out stay in the conversation on the strength of a bracket.
-- They should still lose, and against a rostered winner plus its +50% bonus
-- they do.
--
-- The weight sits on the two hardest calls. Blind from six remaining, the
-- winner is 1 in 6, the exact Final 4 is 1 in 15 and the exact Final 3 is 1 in
-- 20; completing the Final 3 pays 40 and the winner 60. The winner stops at 60
-- deliberately: a perfect bracket with the wrong winner pays 100 and a broken
-- bracket with the right one pays 36 plus the winner, so at 64 and above a
-- lucky champion call would outscore reading the whole endgame.
--
-- The Final 3 ladder restarts rather than continuing from the Final 4's 16
-- because the slates nest: shifted by a single rung, the increments coincide
-- and "all four right, wrong fire-making boot" would tie "missed one of the
-- four but nailed the Final 3". Restarting keeps the endgame read ahead, 84 to
-- 60.
--
-- perfect_final_three is retired — it was this curve bolted onto a flat rate,
-- and the ladder builds it into the 40-point top rung.
--
-- Rung keys with a flat fallback, exactly like the ballot ladder (#694): a
-- season whose snapshot has no rung keys keeps scoring flat plus the bonus, so
-- completed seasons stay time capsules (#170).

insert into prediction_score_types (key, label, point_value, postmerge_point_value)
values
  ('correct_final_four_1',  '1st correct Final 4 name',   2, null),
  ('correct_final_four_2',  '2nd correct Final 4 name',   4, null),
  ('correct_final_four_3',  '3rd correct Final 4 name',   8, null),
  ('correct_final_four_4',  '4th correct Final 4 name',  16, null),
  ('correct_final_three_1', '1st correct Final 3 name',  10, null),
  ('correct_final_three_2', '2nd correct Final 3 name',  20, null),
  ('correct_final_three_3', '3rd correct Final 3 name',  40, null)
on conflict (key) do update set
  label = excluded.label,
  point_value = excluded.point_value,
  postmerge_point_value = excluded.postmerge_point_value;

-- The winner is the other half of the reweighting, and it is an existing key
-- rather than a new rung.
update prediction_score_types set point_value = 60
  where key = 'correct_winner_vote';

-- New seasons snapshot the ladder alone: the flat rates and the bonus are what
-- it replaces. Season snapshots already taken are untouched by this.
delete from prediction_score_types
  where key in ('correct_final_four', 'correct_final_three',
                'perfect_final_three');

-- ── the seasons still in play take the ladder ───────────────────────────────
-- S51 is the real league's season and the one that matters; it is active and
-- has not scored an episode, which is the window for setting this curve. S27
-- and S270 are practice seasons from before there was a non-prod environment.
-- Named by number rather than by status because S270 is already `completed` and
-- still wants the new values — the one place this departs from #694 and #882.
-- Every other season keeps its snapshot exactly as it is.
insert into season_prediction_score_types
    (season_id, key, label, point_value, postmerge_point_value)
select s.id, t.key, t.label, t.point_value, t.postmerge_point_value
from seasons s
cross join prediction_score_types t
where s.season_number in (27, 51, 270)
  and t.key in ('correct_final_four_1', 'correct_final_four_2',
                'correct_final_four_3', 'correct_final_four_4',
                'correct_final_three_1', 'correct_final_three_2',
                'correct_final_three_3')
on conflict (season_id, key) do update set
  label = excluded.label,
  point_value = excluded.point_value,
  postmerge_point_value = excluded.postmerge_point_value;

update season_prediction_score_types x set point_value = 60
  from seasons s
 where x.season_id = s.id
   and s.season_number in (27, 51, 270)
   and x.key = 'correct_winner_vote';

-- Drop the flat keys from those three so the ladder is the only thing scoring
-- them and the Rules page has no stale row to show. Scoring prefers the rungs
-- wherever they exist, so this is belt and braces.
delete from season_prediction_score_types x
using seasons s
where x.season_id = s.id
  and s.season_number in (27, 51, 270)
  and x.key in ('correct_final_four', 'correct_final_three',
                'perfect_final_three');
