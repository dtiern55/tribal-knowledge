---
name: catch-up
description: Catch the qa league up to the fast-lane secondary league — the "second ritual" (#737). Two steps, no survivoR/rulings: while qa is OPEN, copy Danny's own picks (ballot + advantage play + roster swap) secondary→qa (scripts/copy_player_picks.py); after qa LOCKS, transfer the episode result — eliminations, scoring events, tiles — and close it out (scripts/transfer_episode.py). Both verify. Use for "catch qa up to episode N", "copy my picks to qa", "transfer episode N from secondary to qa", "mirror ep N to qa".
---

# Catch up a league — mirror an episode (#737)

Two Blood vs. Water leagues run on prod. **secondary** (Danny + bots) runs
ahead — it's where the real `air-episode` scoring ritual happens first, to catch
bugs before a real player sees them. **qa** has **Casali**, a real human tester
who enters her own picks. This copies an episode's *result* — the show facts,
which are identical for every league playing the season — from secondary into qa
so qa catches up.

It is **player-agnostic**: it scores whatever ballots are already locked (yours,
the bots', and Casali's) and **never enters anything for Casali** — her picks are
hers. This is **not** the `air-episode` ritual: no survivoR, no headline/tile
authoring, no rulings. It just mirrors what secondary already has.

There are **two steps at opposite ends of the episode window** — picks are
copied while qa is still **open**, the score is transferred after it **locks**.
Both dry-run first (`--dry-run`), both match contestants by **name**, both are
idempotent (a re-run skips what's already there), and both connect to prod
(`uv run --env-file .env.prod`).

## Step 1 (while qa is OPEN): copy Danny's picks

Mirror Danny's own play for the episode from secondary into qa so he doesn't
re-enter it by hand. Only **his** rows — never a real player's (Casali, Michele).
Run it once he's played the episode in secondary and qa is still open (before he
locks it for the humans). The tool refuses if the target episode is already
locked.

```bash
cd backend
uv run --env-file .env.prod python scripts/copy_player_picks.py \
  --source-league secondary --target-league qa --episode N \
  --player "Danny Fairplay" --dry-run
# looks right? drop --dry-run:
uv run --env-file .env.prod python scripts/copy_player_picks.py \
  --source-league secondary --target-league qa --episode N --player "Danny Fairplay"
```

Copies his ballot (preserving the ladder ranks, incl. a Power Vote's sealed
name), his advantage play, and a roster swap he made that episode (recomputing
the swap penalty against qa). Writes directly to the DB like `run_bots.py`, one
transaction. Verifies the ballot + play match secondary before committing.

## Step 2 (after qa LOCKS): transfer the score

The target episode must be **locked** (the tool refuses otherwise, so it can't
leak the result). Dry-run first, then apply:

```bash
uv run --env-file .env.prod python scripts/transfer_episode.py \
  --source-league secondary --target-league qa --episode N --dry-run
# looks right? drop --dry-run to write:
uv run --env-file .env.prod python scripts/transfer_episode.py \
  --source-league secondary --target-league qa --episode N
```

It copies eliminations, scoring events, and tiles (each league has its own season
copy), copies secondary's headline/note if it set any, then **closes the episode
out** (`--no-score` to leave it open). Additive and idempotent.

## Verify (built in)

The tool re-reads the target episode and prints **`VERIFY PASS`** only when the
eliminations, scoring events, and tiles all match secondary (by name) **and** the
episode is `scored` — otherwise `VERIFY FAIL` with the exact diff and a non-zero
exit. Read that line back to Danny. For a deeper look, open the qa card
(`?recap={episode_id}` on My Season) or glance at `/league-seasons/{qa_ls}/standings`.

## Notes

- **Prod only** for now (secondary and qa live on prod). `--api` overrides the
  backend URL if that ever changes.
- If a league has more than one season, pass `--source-season-number` /
  `--target-season-number` to disambiguate.
- Points are recomputed from each season's own rule snapshot; both are BvW, so
  they line up — the verify step is what confirms it.
- The show result is the same across leagues, so there's nothing to *rule* on
  here. Real judgment calls and the crafted headline/tiles happen once, in
  `air-episode` on secondary; this just carries them over.
