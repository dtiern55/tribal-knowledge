---
name: air-episode
description: Weekly real-season scoring ritual (#186) — pull the survivoR proposal for an aired episode, review it with context and flags, take the commissioner's rulings (including the judgment calls survivoR can't provide), apply through the additive admin endpoints, then verify the resulting standings. Use when scoring a real or practice season episode.
---

# Air an episode — weekly scoring ritual (#186)

Danny (the commissioner) runs this with you after an episode airs **and**
survivoR has published its data. The rule from #186: never auto-apply —
**propose → review → rule → apply → verify.** This is interactive; do it in the
conversation, one step at a time, and wait for Danny's rulings before writing.

## 0. Connection & inputs

Ask Danny for: **US season number**, **episode number**, and the **league
`season_number`**. Then confirm **which backend** you're scoring — this writes
real data:

- **Prod:** `API=https://tribal-knowledge-app.fly.dev`
- **Local:** `API=http://127.0.0.1:8000` (needs the local stack up — see the
  `verify` skill for bring-up)

Credentials live in `backend/.env` (or `.env.test` for local): `SUPABASE_URL`,
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

## 3. Present with context (what aired)

Show Danny one readable block:

- **Eliminations** — who's out, and how.
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

## 4. Take Danny's rulings

Ask him to: confirm or drop each flagged/auto-mapped item, and name any
**judgment calls** to add (contestant + event). Pull valid slugs+labels from
`GET {API}/seasons/{season_id}/scoring-event-types` so you use real event
types, never guessed ones. It returns only *enabled* types, so retired ones
(the four TV moments) won't appear; the three judgment calls below still do. Assemble the final batch:
**(approved proposal items) + (Danny's manual events).**

## 5. Apply (additive, dedup-aware)

First read what's already there so a re-run doesn't double-count (the admin UI
does exactly this):

- `GET {API}/episodes/{episode_id}/eliminations`
- `GET {API}/episodes/{episode_id}/scoring-events`

Skip anything already recorded (same contestant + type), then:

- `POST {API}/episodes/{episode_id}/eliminations` — `[{contestant_id, elimination_type}, ...]`
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

**If the merge airs this episode**, also turn on post-merge scoring:
`PATCH {API}/seasons/{season_id}` `{"merge_episode": N}`. (Don't set it before
it happens — that's future knowledge.) The point values it changes:
`vote_correctly_at_tribal` **3 → 5** and `correct_elimination` **15 → 18** from
this episode on (#413). Global template only — seasons snapshotted before the
change keep the old values.

## 7. Verify & score

- `GET {API}/seasons/{season_id}/cast` and `.../standings`. Show Danny:
  - per-contestant point deltas for this episode,
  - the new standings order,
  - and **flag anything suspicious**: a voted-out contestant not marked out, a
    contestant sitting at 0 where you expected points.
  - **Not** an anomaly: a player with a *negative* swap delta you didn't enter.
    Roster swaps past the free one are priced in points (#405) and docked
    automatically at swap time (`roster_picks.swap_penalty_points`, summed into
    standings by scoring) — the commissioner enters nothing for them.
- Note anything Danny **deferred** (an unsure judgment call) so it isn't lost.

## 8. Set the reveal insights (Results screen)

The results reveal shows up to three **curated** insight cards plus one
**automatic** lead — `episode_insights` table, config via
`PUT {API}/episodes/{episode_id}/insights` (admin). This step is where you and
Danny decide them. All values come from the events applied in step 5, so run it
after verify; the cards render once the episode is scored (step 9).

- **Automatic lead — nothing to do.** `_auto_league_call` always leads with
  "League call: {boot} — {pct}%" (share of ballots that caught the boot),
  *unless* a curated `pick_popularity` card takes that slot.
- **Recurring baseline — keep every episode.** Configure `performance_vs_median`
  (each viewer's own episode score vs the league median; personalised, evergreen).
  That plus the auto League Call is the standard set Danny wants every week.
- **The actual job of this step: find the manual note.** Scan the episode for a
  *story* worth a `manual_note` — a usage swing, a gamble that backfired, a
  cooled boot-read — **or decide none is worth adding.** A bare computed number
  is not an insight: the built-in types are single-episode and flat
  (`weekly_play_usage` renders "Double Ballot Points usage: 9 of 21", which
  doesn't say it *tripled* or that four of the nine whiffed). Trends and
  whiff-rates only land as a written `manual_note`. So compute the candidates
  (usage per play across recent episodes, boot-catch rate trend, how many who
  doubled their ballot actually caught the boot, roster ownership of the boot),
  judge what's genuinely notable, and write it — or don't.

**The menu** (`insight_type`, up to 3, deduped on target; `display_order` sets
order):
- `pick_popularity` — needs an eliminated `contestant_id`; owns the League Call
  slot. Redundant in single-boot weeks (same % as the auto lead). Not for finales.
- `multiple_correct_ballots` — ballots that called ≥2 boots. Sits out single-boot
  weeks (max any ballot can hit is one).
- `performance_vs_median` — the recurring baseline above. No target.
- `weekly_play_usage` — needs `advantage_type` (`double_roster_points` /
  `double_vote_points` / `roster_swap`). Flat on its own — pair a swing with a note.
- `manual_note` — free text `label` + `value` (+ optional `detail`), no target.

```
PUT {API}/episodes/{episode_id}/insights
[ { "insight_type": "performance_vs_median" },
  { "insight_type": "manual_note", "label": "...", "value": "...", "detail": "..." } ]
```

Then re-open the reveal (`?recap={episode_id}` on My Season, or GET
`/seasons/{season_id}/episode-results/{episode_id}`) to eyeball it.

## 9. Close the episode out

`POST {API}/episodes/{episode_id}/score` — flips status `upcoming` → `scored`
(#49). Easy to forget, and skipping it is silent: points still show, but
standings `trend` / `last_episode_points` keep reporting the *previous* scored
episode (they read `max(episode_number) where status = 'scored'`), and unused
extra-vote plays never get auto-unplayed (#157). Do this **before** step 10 —
verify standings again after, since the trend arrows only become correct here.
409 "already scored" means it's done; picks must be locked first.

## 10. Bot week (practice seasons only)

If the season is bot-driven, take the commissioner's read for episode N+1 —
`likely_boots`, `confidence`, `double_targets` — append it to
`backend/scripts/bot_reads/season_<n>.json`, then:

```
uv run python scripts/run_bots.py week {N+1}
```

Bots pick BEFORE the episode airs, so this runs after scoring N and before
N+1 locks. Never run it after the fact: the whole point is that nothing in
the pipeline knows the result before the commissioner does.

## Remember

- **survivoR lag** gates everything: data lands a day+ after air. If it's
  behind, this ritual waits or falls back to manual admin-UI entry.
- **Judgment calls are always manual** — survivoR never has blindsides, fake
  idols, or steals.
- **Tokens are retired (#307).** Players get one free advantage play per
  episode instead — **Double Castaway Points or Double Ballot Points** (the
  advantage is labeled "Double Ballot Points"; the key `double_vote_points` is
  unchanged). Roster swap **left** this economy (it's points-priced now, above),
  and **Extra Vote is retired**. So there is no allocation to grant and nothing
  to create episode N+1 *for* — create it whenever the schedule is known.
  Episode rows for a full season are usually made up front at setup.
- Fine-grained fixes after applying are easy: scoring events are additive with
  per-item delete (`DELETE {API}/scoring-events/{id}`) in the admin UI.
