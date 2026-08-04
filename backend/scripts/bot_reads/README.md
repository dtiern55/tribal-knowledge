# Bot reads

One file per season: `season_<season_number>.json`. This is the commissioner's
**pre-episode read** — what you think the room would do, written *before* the
episode airs. `run_bots.py` never sees a result, which is what lets the bots
run against a season nobody has watched yet.

```json
{
  "draft": ["Most Wanted", "Next", "..."],
  "episodes": {
    "2": {
      "likely_boots":   ["Most likely", "Next", "Third"],
      "double_targets": ["Who the room would double"],
      "note":           "free text, echoed back when the week runs"
    }
  },
  "finale": {
    "winner":     ["Who the room would back"],
    "early_boot": ["..."],
    "fire_loss":  ["..."]
  }
}
```

Notes from building it:

- **List at least as many `likely_boots` as the episode's pick limit.** Bots
  fill any shortfall from the rest of the field, so a two-name read on a
  three-pick week hands a third of every ballot to noise.
- **`draft` order drives ownership.** Naming someone first gets them rostered
  by nearly everyone, which is what makes their boot cascade through the
  league. That's realistic — use it deliberately.
- **`double_targets` and list length steer the advantage split.** A short
  `likely_boots` list reads as "the room is confident", which pushes the flex
  personas onto the vote double; a wide field pushes them back to their roster
  stars.
- Names are matched case- and punctuation-insensitively. An unrecognised name
  stops the run rather than being silently dropped.
