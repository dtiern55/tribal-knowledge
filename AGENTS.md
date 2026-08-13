# Tribal Knowledge — Agent Guidance

Tribal Knowledge is a private Fantasy Survivor league app for roughly 18 friends.

## Read before working

1. Read `CLAUDE.md` for project architecture, commands, deployment, and repository conventions.
2. Read `../fantasy-survivor-design.md` for product principles, scoring intent, and the history of gameplay decisions.
3. Inspect the current implementation, migrations, and tests for the feature being changed.

The master design document is chronological and intentionally preserves superseded decisions. For current behavior, prefer the latest dated decision together with the shipped code, migrations, and tests. Do not implement an older mechanic merely because it appears earlier in the document.

## Design and UX work

Before changing or mocking My Season, also read:

- `design/my-season-redesign.md`
- `frontend/src/index.css`
- `frontend/src/pages/MySeasonPage.tsx`
- `frontend/src/lib/episodes.ts`
- `frontend/src/lib/advantages.ts`

Keep these concepts distinct:

- **Roster:** the player's active castaways. Their in-show actions earn roster points.
- **Ballot:** the player's elimination predictions for the episode. Correct predictions earn elimination-pick points.
- **Weekly play:** one optional play per episode. It can double one roster member's episode points, double the points from every correct pick on the ballot, or pay for a roster swap after the free swap has been used.

Double Vote Points does not add a pick and does not target one predicted castaway. It doubles the points from all correct elimination picks on that episode's ballot.

Prediction popularity and other players' unlocked choices are private before lock. Aggregate pick statistics belong only in post-score/reveal contexts.

Concept mockups may use placeholder names and sample numbers, but must not invent or conflate gameplay mechanics. Label any unresolved product assumption explicitly.

## Source-of-truth order

When sources disagree, use this order:

1. Current code, migrations, and tests for shipped behavior.
2. The latest dated decision in `../fantasy-survivor-design.md` for product intent.
3. Focused briefs under `design/` for an approved direction that is not yet shipped.
4. Mockups and screenshots as exploratory references, not specifications.

Preserve unrelated working-tree changes. Do not rewrite existing product history to make old seasons follow new rules.
