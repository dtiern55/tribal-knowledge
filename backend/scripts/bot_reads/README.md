# Bot reads

One file per season: `season_<season_number>.json`. This is the commissioner's
**pre-episode read** — what you think the room would do, written *before* the
episode airs. `run_bots.py` never sees a result, which is what lets the bots
run against a season nobody has watched yet.

```json
{
  "draft": ["Most Wanted", "Next", "..."],
  "avoid": ["Nobody would pick them after that premiere"],
  "episodes": {
    "2": {
      "likely_boots":   ["Most likely", "Next", "Third"],
      "safe":           ["Nobody would vote for them this week"],
      "confidence":     "high | medium | low",
      "double_targets": ["Who the room would double"],
      "note":           "free text, echoed back when the week runs"
    }
  },
  "finale": {
    "final_four":  ["Who reaches fire-making", "...ranked pool"],
    "final_three": ["Who reaches the final tribal", "..."],
    "winner":      ["Who the room would back"]
  }
}
```

The `finale` block is the one part you write late: names that have been voted
out by finale night are dropped, so a read written at the merge is mostly
wasted. Write it once the final few are set.

Each slate is a ranked candidate pool; bots take the top few after their own
biased shuffle — 4 for `final_four`, 3 for `final_three`, 1 for `winner`. The
slates score independently against the real bracket, so they needn't be nested;
the same names can appear in several pools.

Check a read without filing anything:

```
uv run python scripts/run_bots.py ballot --check
```

It names the season it would write to, reports every problem at once rather
than stopping at the first, and warns when a `finale` list has gone stale.

Notes from building it:

- **List at least as many `likely_boots` as the episode's pick limit.** Bots
  fill any shortfall from the rest of the field, so a two-name read on a
  three-pick week hands a third of every ballot to noise.
- **`draft` order drives ownership.** Naming someone first gets them rostered
  by nearly everyone, which is what makes their boot cascade through the
  league. That's realistic — use it deliberately.
- **`confidence` steers the advantage split**, and it defaults to `medium`.
  `high` pushes the flex personas onto the vote double, `low` sends them to
  their roster stars, `medium` splits them. State it — it used to be inferred
  from how many names `likely_boots` held, which conflated "how many people
  could go" with "how sure am I": a read covering two tribes looked uncertain
  purely because it was long.
- **`safe` keeps someone off ballots entirely.** Names not in `likely_boots`
  still get votes from the spread and contrarian personas, since they land in
  the leftover field. If the read says nobody would vote for them, say so here.
- **Bots only swap off an eliminated castaway.** There's no reason to burn a
  swap while your five are all alive, so a name appearing in `likely_boots`
  never triggers one — only a slot that's actually dead does. A free swap
  covers it; past that it costs the week's play, which a Roster Loyalist
  won't pay.
- **`double_targets` decides who a roster double lands on** — bots only double
  a castaway they actually roster, so naming a whole tribe is fine.
- Names are matched case- and punctuation-insensitively. An unrecognised name
  stops the run rather than being silently dropped. Matching strips digits
  too, so placeholder casts numbered `Castaway 01`/`Castaway 02` collide —
  real names don't, but test fixtures should use distinct words.
- **A `finale` list whose names are all out falls back to the whole field**,
  which spreads every bot at random. So does an empty or missing list. Both
  are warnings on `ballot --check` (#534) — the ballot still files, it just
  files a worse one.
