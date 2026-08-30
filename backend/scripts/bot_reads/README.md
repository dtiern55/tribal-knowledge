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
  }
}
```

The finale bracket needs no read (#582). Each bot crowns its own **Sole
Survivor** designation as the winner — when that castaway actually reached the
finale — and fills the rest of the Final 4 / Final 3 at random from the
finalists; a bot whose designee was voted out earlier, and a quarter of the
rest, back another finalist. Run it against the active season pre-finale, or
`--season <n>` to backfill one whose finale is already scored:

```
uv run python scripts/run_bots.py ballot            # active season
uv run python scripts/run_bots.py ballot --check    # names the season, writes nothing
uv run python scripts/run_bots.py ballot --season 37
```

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
