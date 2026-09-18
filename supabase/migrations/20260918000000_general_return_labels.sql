-- Rules page twists (2026-09-18): Edge of Extinction and voted-back-in
-- returns score like Redemption Island, so the three island events get labels
-- that fit any second-chance twist. Active and upcoming seasons take the relabel;
-- completed ones stay time capsules (#170).

update scoring_event_types set label = case event_type
    when 'win_redemption_duel' then 'Win a duel to stay in the game'
    when 'return_from_redemption' then 'Return to the game at the merge'
    when 'return_from_redemption_endgame' then 'Return to the game in the endgame'
  end
where event_type in ('win_redemption_duel', 'return_from_redemption',
                     'return_from_redemption_endgame');

update season_scoring_event_types et set label = case et.event_type
    when 'win_redemption_duel' then 'Win a duel to stay in the game'
    when 'return_from_redemption' then 'Return to the game at the merge'
    when 'return_from_redemption_endgame' then 'Return to the game in the endgame'
  end
from seasons s
where s.id = et.season_id and s.status <> 'completed'
  and et.event_type in ('win_redemption_duel', 'return_from_redemption',
                        'return_from_redemption_endgame');
