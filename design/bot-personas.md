# Bot personas — S28 Cagayan practice season

The practice "league" is 17 bot accounts + Danny. Bots have no automated
driver; their moves are made during the weekly `/air-episode` ritual following
this playbook. Goal: realistic, varied behavior — not everyone optimizes.

## Season economics (context)
- Everyone gets ~**40 tokens total** (10 each for eps 1–4; ep5+ locked).
- Advantages: **Double Vote 10 · Double Roster 15 · Extra Vote 20**.
- Swaps: **1 free**, then **30 each** (max 3), swaps lock ep4. At 30 tokens a
  paid swap is ~75% of the whole budget, so a 2nd paid swap is effectively out
  of reach for anyone who also buys advantages. Kept at 30 deliberately
  (2026-07-21) — paid swaps stay a rare, major commitment.

## Universal rules (active bots)
- **Free swap is a given** — every active bot uses its one free swap during the
  season: deployed when a roster pick is voted out (ep3+), otherwise to upgrade
  a weak pick before swaps lock (ep4).
- **Prioritize roster swaps** — when a roster pick is eliminated, fixing it
  comes before buying doubles.
- Then spend remaining tokens on the bot's **focus advantage**, when affordable.
- Roster = 5 castaways, picked with no strategic "feel" (varied per bot).

## Advantage focus — even 3-way split
| Focus | Bots |
|---|---|
| **Double Vote Points** (10) | double_tap_bot, contrarian_bot, émōji_bot_🔥, chaos_bot |
| **Double Roster Points** (15) | by_the_rules_bot, copycat_bot, bandwagon_bot, last_second_bot_2 |
| **Extra Vote** (20) | all_in_bot, last_second_bot, the_bot_with_an_extremely_long_display_name, chaos_bot_2 |
| **Roster swaps** (specialist) | swap_happy_bot — free + one paid swap, spare tokens → Double Vote |

`chaos_bot` / `chaos_bot_2` may rotate their focus episode-to-episode rather
than sticking to one. `last_second_bot*` always act at the buzzer.

## Low / quirk engagement (fewer or no advantages — the "don't optimize" tail)
- **broke_bot** — blows tokens early on cheap Double Votes, then broke (no swaps).
- **forgetful_bot** — buys an advantage but often forgets to play it (leaves it unplayed).
- **ghost_bot** — barely participates; sets a roster at most, no advantages, may miss picks.
- **quitter_bot** — active eps 2–3, then stops.

## Why
Danny's hypothesis: in a real league Double Roster would be most popular (feels
safest). Bots can't have that "feel," so the split is deliberately even to
generate clean variety across all three advantages, with a realistic tail of
under-engaged players. Revisit the mix / swap cost after seeing the season's
token tallies.
