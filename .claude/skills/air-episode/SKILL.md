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
types, never guessed ones. Assemble the final batch:
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
- Finale placements: `PATCH {API}/contestants/{contestant_id}` — `{placement}`

Use a traceable `notes` like `import: {source}` on applied events.

## 6. Sync tribes to this episode

`POST {API}/seasons/{season_id}/sync-tribes?source_season={US}&up_to_episode={N}`
— bounds tribe membership to what's aired, so the buffs follow swaps without
leaking future tribes (#212). Run it every week with this episode's number.

**If the merge airs this episode**, also turn on post-merge scoring:
`PATCH {API}/seasons/{season_id}` `{"merge_episode": N}`. (Don't set it before
it happens — that's future knowledge, and it changes point values.)

## 7. Verify & score

- `GET {API}/seasons/{season_id}/cast` and `.../standings`. Show Danny:
  - per-contestant point deltas for this episode,
  - the new standings order,
  - and **flag anything suspicious**: a voted-out contestant not marked out, a
    contestant sitting at 0 where you expected points.
- Note anything Danny **deferred** (an unsure judgment call) so it isn't lost.

## 8. Close the episode out

`POST {API}/episodes/{episode_id}/score` — flips status `upcoming` → `scored`
(#49). Easy to forget, and skipping it is silent: points still show, but
standings `trend` / `last_episode_points` keep reporting the *previous* scored
episode (they read `max(episode_number) where status = 'scored'`), and unused
extra-vote plays never get auto-unplayed (#157). Do this **before** step 9 —
verify standings again after, since the trend arrows only become correct here.
409 "already scored" means it's done; picks must be locked first.

## 9. Bot week (practice seasons only)

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
  episode instead, so there is no allocation to grant and nothing to create
  episode N+1 *for* — create it whenever the schedule is known. Episode rows
  for a full season are usually made up front at setup.
- Fine-grained fixes after applying are easy: scoring events are additive with
  per-item delete (`DELETE {API}/scoring-events/{id}`) in the admin UI.
