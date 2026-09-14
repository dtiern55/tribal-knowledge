---
name: catch-up
description: Copy an already-scored episode's result from the fast lane (the secondary league) into the qa league so qa catches up — the "second ritual" (#737). No survivoR, no rulings; it mirrors eliminations, scoring events, and tiles, closes the episode out, and verifies the target matches the source. Use when the qa league needs to catch up to secondary on a locked episode — "catch qa up to episode N", "transfer episode N from secondary to qa", "mirror ep N to qa".
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

## Do it

The target episode must be **locked** (the tool refuses otherwise, so it can't
leak the result). Dry-run first, then apply:

```bash
cd backend
uv run --env-file .env.prod python scripts/transfer_episode.py \
  --source-league secondary --target-league qa --episode N --dry-run
# looks right? drop --dry-run to write:
uv run --env-file .env.prod python scripts/transfer_episode.py \
  --source-league secondary --target-league qa --episode N
```

It copies eliminations, scoring events, and tiles (matched by contestant **name**
— each league has its own season copy), copies secondary's headline/note if it
set any, then **closes the episode out** (`--no-score` to leave it open).
Additive and idempotent: a re-run skips anything already there.

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
