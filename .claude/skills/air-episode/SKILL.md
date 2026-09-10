---
name: air-episode
description: Weekly real-season scoring ritual (#186) — pull the survivoR proposal for an aired episode, review it with context and flags, take the commissioner's rulings on the whole package (eliminations, events, judgment calls, the results card headline, and the tiles) before anything is written, apply through the additive admin endpoints, then verify the resulting standings. Use when scoring a real or practice season episode.
---

# Air an episode — weekly scoring ritual (#186)

Danny (the commissioner) runs this with you after an episode airs **and**
survivoR has published its data. The rule from #186: never auto-apply —
**propose → review → rule → apply → verify.** The rule from #712: **nothing is
written to a production backend until the whole package is approved** —
eliminations, events, judgment calls, the results card headline, and every
tile. This is interactive; do it in the conversation, and before each write
say what it makes visible to players.

## 0. Connection & inputs

Ask Danny for: **US season number**, **episode number**, and the **league
`season_number`**. Then confirm **which backend** you're scoring — this writes
real data:

- **Prod:** `API=https://tribal-knowledge-app.fly.dev`, credentials in
  `backend/.env.prod` (`uv run --env-file .env.prod ...` for scripts)
- **Staging:** `API=https://tribal-knowledge-staging.fly.dev`, credentials in
  `backend/.env` (the default — practice seasons live here, #150)
- **Local:** `API=http://127.0.0.1:8000` (needs the local stack up — see the
  `verify` skill for bring-up), credentials in `.env.test`

Credentials needed from whichever file: `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `PRODUCER_EMAIL`, `PRODUCER_PASSWORD`. Get a producer JWT
the same way `scripts/import_episode.py` does, and use it as `Bearer` on every
call below:

```
POST {SUPABASE_URL}/auth/v1/token?grant_type=password
  headers: apikey: {SUPABASE_ANON_KEY}
  json:    {"email": PRODUCER_EMAIL, "password": PRODUCER_PASSWORD}
  → access_token
```

## 1. Resolve IDs

- `GET {API}/seasons` → the one with `season_number` == league season → `season_id`.
- `GET {API}/seasons/{season_id}/episodes` → `episode_number` == N → `episode_id`.
  Missing? The episode row must exist first (create it from the TVMaze episode
  proposal, #197). Stop and tell Danny.

## 2. Pull the proposal (endpoint-driven, server builds it)

```
GET {API}/episodes/{episode_id}/import-proposal?source_season={US_season}&refresh=true
→ { eliminations, events, placements, warnings, unmatched, source }
```

- **404 "No survivoR data for season US<n>"** → survivoR hasn't published this
  season/episode yet (it lags air by a day+). **Stop.** Either wait for
  survivoR, or Danny enters this episode manually in the admin UI. Never
  fabricate scores.
- **`unmatched` non-empty** → league cast names don't line up with survivoR;
  those people were dropped from the proposal. Report the names — fix the cast
  spelling or note the gap before applying.

## 3. Present the whole package — nothing written yet

Every write from here on is player-visible somewhere (step 5 says where), so
the commissioner reviews **everything** before the first one. Show Danny one
readable block, in plain words — no skill vocabulary ("recap", "reveal",
"manual note", "insight type"). Say "the results card", "the headline", "a
tile".

**How to write it.** State the proposal. Don't explain it. Danny watched the
episode and can read a table — he does not need the reasoning behind a normal
scoring line, only behind something genuinely unusual, and then in one
sentence. Tables and short lines over prose.

**Never ask a question in the body.** No "confirm this", no "is that right?",
no "say the word" scattered through the sections — he can't answer a question
buried on line 24. If you truly need a ruling beyond his go-ahead, put every
one of them in a single **numbered list at the very end**, so he can answer
"1 yes, 2 skip". Anything he can simply correct while reading is not a
question; leave it out.

**A. What aired**
- **Eliminations** — who's out, and how. On a Redemption Island week say for
  each one whether they **left the game** (`is_final: true`) or **went to the
  island** (`is_final: false`). The proposal carries the flag; if survivoR
  has no next-episode tribe mapping yet it defaults to final — that one goes
  in the numbered list at the end.
- **Scoring events per contestant** — grouped by person.
- **A "what aired" read derived from the events** — immunity winner(s)
  (`win_individual_immunity` / `win_team_immunity`), reward winners, who voted
  correctly, votes-received counts, idol acquisitions/plays. This is the
  cross-check against the episode Danny just watched.
- **Placements** (finale only).
- **Review flags** — split `warnings` into:
  - *auto-mapped, verify* — ambiguous mappings the importer wants confirmed.
  - *judgment calls survivoR never provides* — `blindside_with_active_idol`,
    `fake_idol_played`, `steal_immunity_idol`. (Television moments retired
    with the token economy — see #307.)
- *(Optional context)* the episode's TVMaze summary, if quick to fetch.

**B. The results card headline** — the line every player reads first when the
card opens. Quote the default exactly as it would render, and stop there — he
takes it or writes his own. The default (computed by the card from the
eliminations' final flag) is:
- one boot: `{Name}'s torch was snuffed`
- several: `Two torches snuffed` (number spelled out)
- Redemption Island week: one line per castaway, island trips first —
  `{Name} sent to Redemption.` / `{Name} sent home.`
- nobody out: `No one was voted out`

A wrong final flag makes a wrong default, so B depends on A being right.

**C. The tiles** — the results card shows up to three tiles beside one
automatic lead. Present each one **as it will render**: label / value /
detail. Two kinds:

- *Computed* tiles the app fills in per viewer at open time. Say what each
  shows, not a number you made up:
  - Automatic lead, always there, no config: "League call: {boot} — {pct}%"
    (share of ballots that caught the boot), unless a `pick_popularity` tile
    takes that slot.
  - `performance_vs_median` — the viewer's own episode score vs the league
    median. **The recurring baseline; propose it every week.**
  - `multiple_correct_ballots` — ballots that called two or more boots. Only
    on multi-boot weeks (a single-boot week caps every ballot at one).
  - `pick_popularity` — needs an eliminated `contestant_id`; owns the League
    Call slot. Redundant in single-boot weeks. Not for finales.
  - `weekly_play_usage` — needs `advantage_type` (`double_roster_points` /
    `double_vote_points` / `roster_swap`). Renders flat ("Double Ballot Points
    usage: 9 of 21"); pair a swing with a written tile instead.
- *Written* tiles (`manual_note`: `label` + `value` + optional `detail`) —
  the story. **Compute one or two candidates now, from reads only:** the
  approved batch from A plus the locked picks and plays already in the DB.
  Advantage usage this week and its trend across recent episodes, boot-catch
  rate vs last week, how many who doubled their ballot caught the boot,
  roster ownership of the boot(s), the biggest point swing. A bare number is
  not a tile; a trend or a whiff-rate is. Quote each candidate's exact label,
  value, and detail.

  **One row per episode, shown on every league's card.** A written tile's
  numbers must be true for every league on this backend, so no per-league
  counts ("9 of 21 in the main league"); say it as a share, or as a fact
  about the show. `docs/scoring.md` → Episode Reveal insights.

**The two computed tiles are standing defaults** (2026-09-09): the viewer's
score against the league median every week, and multiple correct picks on any
multi-boot week. Set them without asking. The **written** tile is the only
tile question — Danny picks one, rewrites it, or wants none. **Never choose
that one for him.**

## 4. Take Danny's rulings — go on all of it

Ask him to confirm or drop each flagged/auto-mapped item, name any
**judgment calls** to add (contestant + event), settle the headline, and
settle the tiles. Pull valid slugs+labels from
`GET {API}/seasons/{season_id}/scoring-event-types` so you use real event
types, never guessed ones. It returns only *enabled* types, so retired ones
(the four TV moments) won't appear; the three judgment calls above still do.

Assemble the final package: **(approved proposal items) + (Danny's manual
events) + headline (his text, or null for the default he approved) + the tile
set.** Read it back in one block. Write nothing until he says go on the
whole package. Note anything he **deferred** (an unsure judgment call) so it
isn't lost.

## 5. Apply (additive, dedup-aware)

**Visible to players the moment it lands:** standings (`active_survivors`
drops the eliminated, `total_points` jumps) and the cast page. Neither gates
on lock or scored status (#559). Say so before you POST.

**First, confirm this episode's picks are LOCKED** — `picks_lock_at <= now()`
(or `status = 'scored'`). Applying before lock leaks the boots and the point
changes to every player who hasn't locked yet. If the episode aired but picks
are still open, either wait for the lock or, with Danny's OK, lock it now
(the `episode-lock` skill, or `PATCH {API}/episodes/{episode_id}`
`{"picks_lock_at": "<now>"}`) before applying.
`GET {API}/seasons/{season_id}/episodes` shows each episode's `picks_lock_at`.

Then read what's already there so a re-run doesn't double-count (the admin UI
does exactly this):

- `GET {API}/episodes/{episode_id}/eliminations`
- `GET {API}/episodes/{episode_id}/scoring-events`

Skip anything already recorded (same contestant + type), then:

- `POST {API}/episodes/{episode_id}/eliminations` — `[{contestant_id, elimination_type, is_final}, ...]`
  Pass `is_final` from the approved package; it defaults to true, and a
  Redemption Island trip posted without it reads as an exit everywhere.
- `POST {API}/episodes/{episode_id}/scoring-events` — `[{contestant_id, event_type, quantity, notes}, ...]`
  (scoring events are points-only now; the token grant path is inert — #307)
- **Finale placements:** `PATCH {API}/contestants/{contestant_id}` — `{placement: 1|2|3}`.
  A DB trigger now auto-generates the finale scoring events from `placement`
  (`made_final_tribal` / `runner_up` / `won_season`), so **PATCH placement is the
  ONLY thing you do — never also POST those events** (double-count). Point model:
  30 / 20 / 50 for made-final / runner-up / won, and they stack, so totals are
  **1st = 80, 2nd = 50, 3rd = 30**. The Sole-Survivor designee bonus is **+50%**
  now (not ×2), applied for free by the finale multiplier. `import-proposal` still
  returns `placements`; apply them via PATCH, nothing more.

Use a traceable `notes` like `import: {source}` on applied events.

## 6. Sync tribes to this episode

`POST {API}/seasons/{season_id}/sync-tribes?source_season={US}&up_to_episode={N}`
— bounds tribe membership to what's aired, so the buffs follow swaps without
leaking future tribes (#212). Run it every week with this episode's number.
Visible on the cast page and the My Season tribe lane.

**If the merge airs this episode**, also turn on post-merge scoring:
`PATCH {API}/seasons/{season_id}` `{"merge_episode": N}`. (Don't set it before
it happens — that's future knowledge.) The point values it changes:
`vote_correctly_at_tribal` **3 → 5** and `correct_elimination` **15 → 18** from
this episode on (#413). Global template only — seasons snapshotted before the
change keep the old values.

## 7. Verify the standings

- `GET {API}/seasons/{season_id}/cast` and `.../standings`. Show Danny:
  - per-contestant point deltas for this episode,
  - the new standings order,
  - and **flag anything suspicious**: a voted-out contestant not marked out, a
    contestant sitting at 0 where you expected points, a Redemption Island
    castaway shown as out of the game.
  - **Not** an anomaly: a player with a *negative* swap delta you didn't enter.
    Roster swaps past the free one are priced in points (#405) and docked
    automatically at swap time (`roster_picks.swap_penalty_points`, summed into
    standings by scoring) — the commissioner enters nothing for them.
- If a written tile's numbers came from the pre-apply estimate in step 3,
  confirm them against the real deltas now. A change goes back to Danny
  before it is written.

## 8. Write the headline and the tiles

Both are invisible until close-out (the results endpoints gate on
`status = 'scored'`), so this is the safe write. Only the approved package:

- Headline: `PATCH {API}/episodes/{episode_id}` `{"headline": "..."}`. Leave
  it null when Danny approved the default.
- Tiles: `PUT {API}/episodes/{episode_id}/insights` (admin), up to 3,
  deduped on target, `display_order` sets order:

```
PUT {API}/episodes/{episode_id}/insights
[ { "insight_type": "performance_vs_median" },
  { "insight_type": "manual_note", "label": "...", "value": "...", "detail": "..." } ]
```

## 9. Close the episode out — the last write

**Visible to players the moment it lands:** the results card (headline,
tiles, ballot and roster scoring) opens for everyone, and standings trend
arrows update. Say so, and confirm the headline and tiles are in first.

`POST {API}/episodes/{episode_id}/score` — flips status `upcoming` → `scored`
(#49). Skipping it is silent: points still show, but standings `trend` /
`last_episode_points` keep reporting the *previous* scored episode (they read
`max(episode_number) where status = 'scored'`), and unused extra-vote plays
never get auto-unplayed (#157). Do this **before** the bot week (step 11) —
verify standings again after, since the trend arrows only become correct
here. 409 "already scored" means it's done; picks must be locked first.

Then open the card as a player would (`?recap={episode_id}` on My Season, or
`GET /seasons/{season_id}/episode-results/{episode_id}`) and read the
headline and tiles back to Danny as rendered. A fix after the fact is a
`PATCH` on the headline or a `PUT` on the tiles; the card re-reads both.

## 10. Back up prod (real seasons)

Right after close-out, from `backend/`:
`uv run --env-file .env.prod python scripts/backup_db.py prod`. Free tier has no
backups; this weekly dump is the only copy. Needs Docker up. Details in
`docs/operations.md` → Weekly airing and scoring, step 6.

## 11. Bot week (practice/bot seasons only)

If the season is bot-driven (a `bot_reads/season_<n>.json` exists), take the
commissioner's read for episode N+1 — `likely_boots`, `confidence`,
`double_targets` — append it as the `"<N+1>"` entry to
`backend/scripts/bot_reads/season_<n>.json`, then:

```
uv run python scripts/run_bots.py week {N+1} --league Bots --season {season_number}
```

Turning the read into fields:
- **`likely_boots`** as `[name, weight]` pairs controls the **ballot vote split**.
  Weights are *relative shares*, apportioned across `max_picks × non-contrarian
  bots` slots — so make them sum near that total and each weight reads roughly as
  a vote count (e.g. Christian 14 / Angelina 8 / six others 2 → ~15 / ~8 / ~2
  each). Use full names (`"Christian Hubicki"`); list only living castaways.
- **`double_targets`** steers the **roster-point double** (Double Castaway
  Points): bots prefer to double a held roster member named here. List *all*
  living castaways to make that choice random/unsteered.
- **`confidence`** (`high`/`medium`/`low`) is stated, not inferred — `high` nudges
  the contrarians to double their ballot.
- Ballot-doubling isn't targeted: it emerges — the more ballots a boot draws, the
  more vote-doublers land on it ("some double him, fewer double her").
- After running, spot-check the split: count `elimination_picks` for episode N+1
  grouped by contestant, and confirm it matches the read before moving on.
- The file is committed alongside the earlier weeks — open a PR (main is
  protected), the DB already has the picks.

Bots pick BEFORE the episode airs, so this runs after scoring N and before
N+1 locks. Never run it after the fact: the whole point is that nothing in
the pipeline knows the result before the commissioner does.

## Remember

- **survivoR lag** gates everything: data lands a day+ after air. If it's
  behind, this ritual waits or falls back to manual admin-UI entry.
- **Never apply before picks lock (#559).** Standings and the cast page count
  scoring events / eliminations with no lock or scored-status gate, so a
  pre-lock apply spoils the boots and point changes live. Check the lock first
  (step 5); if you must go early, lock the episode first with Danny's OK.
- **Judgment calls are always manual** — survivoR never has blindsides, fake
  idols, or steals.
- **The headline and the tiles are the commissioner's, every episode (#712).**
  Present them as they will render, in plain words, before the first write.
  Close-out is the last write and only after they are in.
- **Tokens are retired (#307).** Players get one free advantage play per
  episode instead — **Double Castaway Points or Double Ballot Points** (the
  advantage is labeled "Double Ballot Points"; the key `double_vote_points` is
  unchanged). Roster swap **left** this economy (it's points-priced now, above),
  and **Extra Vote is retired**. So there is no allocation to grant and nothing
  to create episode N+1 *for* — create it whenever the schedule is known.
  Episode rows for a full season are usually made up front at setup.
- Fine-grained fixes after applying are easy: scoring events are additive with
  per-item delete (`DELETE {API}/scoring-events/{id}`) in the admin UI.
