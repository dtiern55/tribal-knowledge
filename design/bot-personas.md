# Bot archetypes — S28 Cagayan practice season

The practice "league" is 17 bots + Danny. They exist to **calibrate the
advantages**: each bot isolates one advantage at a defined skill level, so the
expected value of every advantage is readable from the standings.

Bots are **outcome-scripted** (decided 2026-07-21): to hit a target accuracy
(e.g. "right 1/4 of the time") or "double the top scorer," the driver sets each
bot's picks/plays from the *known* Cagayan results. This foresight applies to
the test instruments only — never to Danny's own play, and other players' picks
are hidden pre-lock regardless.

## Economics (context)
- Advantage window widened to **ep 2–9** (advantage_lock=10) for cleaner data;
  ~90 tokens/player over the season. Advantages: Double Vote 10 · Double Roster
  15 · Extra Vote 20. Swap: 1 free, then 30 (kept high).

## The archetype grid — 5 / 5 / 5 / 5
Four groups of five: three that **specialize** in one advantage, and five
**generalists** that use all three. Within each group, one **skill** level per
bot — 100 / 80 / 60 / 40 / 20% — the rate at which the bot succeeds at whatever
it attempts (predicting the boot, doubling the true top scorer, landing the
extra pick). 20 bots total.

| Group (×5) | Buys | Skill dial means |
|---|---|---|
| **Double Roster specialists** | Double Roster only | doubles the real top scorer that % of episodes |
| **Double Vote specialists** | Double Vote only | boot prediction right that % + doubled |
| **Extra Vote specialists** | Extra Vote only | the extra pick hits that % |
| **Generalists** | all three | succeeds at all three at that % |

Each group has one bot at **100 / 80 / 60 / 40 / 20%**. Every bot also makes its
base weekly elimination pick at its skill rate, holds a 5-castaway roster, and
free-swaps a dead pick. Two flavor accounts (🔥 emoji, the long-name one) sit on
generalist tiers for incidental UI coverage. Skill is approximate over the
~8-episode window; the driver uses a per-(bot, episode) seed so the hit rate
lands near target and is reproducible.

*(Room to grow to ~30 later by adding replicates per cell if the data is noisy —
the driver's archetype list is just config.)*

## Reading the data
- **Per-advantage EV vs skill**: each specialist group is a clean curve — e.g.
  Double Vote at 100/80/60/40/20 shows exactly how the advantage's value falls
  with skill. Compare the three specialist curves to see which advantage pays
  best (tests the "Double Roster is safest/most valuable" hunch).
- **Generalists vs specialists**: whether using everything beats focusing.
- The driver logs per-advantage points earned for a clean breakdown.

## Mechanics (how the driver realizes each)
- **Roster**: every bot picks 5 castaways at ep2 (varied). Boots get replaced
  only by Swap Maximizer (free/paid) and All-Rounder (free); others let dead
  picks ride (keeps the advantage signal clean).
- **Vote / Extra accuracy**: per episode the driver knows the real boot; it sets
  the bot's elimination pick to the boot (hit) or a survivor (miss) to track
  toward the target rate. Extra Vote bots get the extra slot; the extra pick's
  hit rate is the tuned dial.
- **Double Roster target**: optimal = the real top scorer that episode;
  by-average = highest prior-episode average on roster; random = any active pick.
- **Tokens**: each bot buys only what its archetype plays, within its balance.

## Why
Turns the bots from engagement/edge-case fixtures (quitter, ghost, forgetful —
not worth testing) into a clean calibration harness. After a few episodes the
standings show the real EV of each advantage at each skill tier, which prices
them and tests Danny's "Double Roster feels safest/most popular" hypothesis.
