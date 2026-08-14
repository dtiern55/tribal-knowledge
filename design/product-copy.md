# Product copy guide

Tribal Knowledge is a private game among friends. Its copy should be direct,
confident, and lightly thematic without turning every instruction into
Survivor flavor text.

## Voice

- Lead with the state or action a player needs now.
- Prefer one useful sentence over a heading followed by a restatement.
- Use short, active button labels: **Save ballot**, **Join league**, **Try again**.
- Use Survivor language where it is already familiar; keep account, error, and
  accessibility copy literal.

## Gameplay terms

- **Roster:** the player's active castaways. Players choose or add roster
  members; do not call roster members "picks" in display copy.
- **Ballot:** the collection of elimination votes submitted for an episode.
- **Vote:** one castaway selected on a normal episode ballot.
- **Prediction:** one of the distinct finale outcomes, where "vote" would be
  inaccurate.
- **Weekly play:** one optional episode decision. Name the specific play when
  one was used.
- **Locked:** choices can no longer be edited. Locked does not by itself mean
  an episode has started, ended, or been scored.
- **Scored:** the commissioner has recorded the episode results and league
  points are available.

Preserve historical mechanic names such as **Double Vote Points** when they
are shown as proper labels. Internal API and database names may continue to use
"pick" where changing them would not improve the player experience.

## State and timing

- Describe only facts the app knows. A lock time may be before airtime, so
  locked-state copy must not claim the episode is underway or over.
- Prefer durable language such as “Results appear after scoring” over a guess
  about when scoring will happen.
- Do not reveal or imply outcomes, popularity, or other players' choices before
  the relevant reveal context.

## Help, empty states, and errors

- Helper text should answer a likely question; remove it when it merely repeats
  the label or heading.
- Empty states should explain whether the player needs to act or wait.
- Error messages should say what failed and, when known, how to recover. Keep
  raw service errors only when they provide a specific actionable reason.

## Account language

- **Account** means authentication credentials.
- **League profile** means the display identity other players see.
- A new player creates an account, then joins the private league with a join
  code. Do not imply that the account email itself grants league access.
