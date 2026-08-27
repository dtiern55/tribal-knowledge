# Painted direction (#552)

**Status:** Direction settled. Icon set settled. Surface treatment forked —
"painted plaque" is the safe default, "one panel" is being explored on a branch.
**Last updated:** 2026-08-27
**Issue:** [#552](https://github.com/dtiern55/tribal-knowledge/issues/552) — decide whether the painted identity survives the flat card layout

This is the revert point. Everything below is decided at commit `2518a56`
(main, post-#548) with no code changed yet.

## The question #552 asked

Three visual languages ended up on one screen — painted raster, the flat vector
chrome from #548, and the line icons — and no rule said where each one lives.

## The decision: more painted, with My Season carrying it

Push paint onto the structure rather than retreat to flat. **My Season is the
main event and is allowed to be louder than the other tabs.** Standings, Cast,
Team and Rules stay flatter on purpose — an appendix should read like one, and
the contrast is what marks where the week actually happens.

Direction B ("texture is for objects, structure is flat") was the original
recommendation and was rejected: it retires the hand-made quality from exactly
the surface that should carry it.

## What the audit found

The issue named three languages. There are five, and "painted" was two unrelated
families filed under one word:

| Family | Assets | Where |
| --- | --- | --- |
| Brush texture | `brush-divider.png`, `points-brush-swatch.png` | Divider, ×2 card rule, My Points chip |
| Illustrated objects | `weekly-advantage-idol-dimensional.png`, `sole-survivor-medallion-…png` | The ×2 idol, the Sole Survivor necklace |
| Solid silhouette | `cast-icon-mask.png` | Cast tab, as a CSS mask |
| Line icons | ~14 inline SVGs | Everywhere else |
| Elevated card | — | #548's lane stack, My Season only |

The loudest inconsistency was never texture-vs-vector. Jungle Earth says
*remove white cards entirely*, which is why Standings, Cast and Rules are flat
rows on the cream ground. #548 put an elevated white card back, on one page. So
**My Season is the only page made of cards** — and that is what
[#551](https://github.com/dtiern55/tribal-knowledge/issues/551) would have
spread to five more pages. Settling this first was the right sequencing.

## Settled: how painted surfaces are made

Two mechanisms cover the whole system. Neither needs commissioned art.

1. **Nine-slice the swatch.** `points-brush-swatch.png` is a painted rectangle
   with ragged edges. Sliced nine ways with the middle tiled
   (`border-image: … 46 fill / 14px / 0 repeat`) it stretches to any card at any
   height with the grain intact. The border width *is* the card's padding —
   ~14px reads as a normal inset; 30px swallows the content.
2. **Generate the torn edge.** An SVG turbulence filter
   (`feTurbulence` + `feDisplacementMap`) displaces any solid shape into a
   hand-torn one, in any colour, for no bytes.
3. **Recolour, don't redraw.** Cream, terracotta and gold swatches are the one
   green asset recoloured in code, keeping the bristle grain as a light–dark
   ripple around the new hue. Light targets need a gentler, darkening-biased
   ripple or the grain reads as grey dirt.

Shopping list: a cream recolour of the swatch, plus brush rules in the colours
the divider doesn't have. No per-width band art, no separate night set.

## Settled: the icon set

The Cast buffs work for three reasons — **solid mass rather than outline, a
rough edge, and details knocked out of the shape instead of drawn on top**. The
rest of the set is rebuilt on those rules.

- **My Season (palm)** — not redrawn. The shipped icon's own four paths, all
  four filled, canopy and drooping frond overlapping as they do today. Four
  other readings were tried and rejected; outlining everything closes to a
  scribble at nav size, and a cleaner separated version drifted from the
  original.
- **Standings (torches)** and **Cast (buffs)** — kept as drawn.
- **History (tally)** — fat bars, slash round-capped so its ends match the bars.
- **Ballot (slip)** — the original's composition, an outline with a scrawl
  inside, with both marks thickened into painted strokes.

**Route: raster, not filter.** Alpha masks tinted by `currentColor`, the same
mechanism `BuffPairIcon` already uses. Generated procedurally from the same
vector shapes, tuned against the buffs' own alpha channel (27% opaque, under 2%
partial, sparse holes just inside the edge) — the raster route without a
commission. If these are ever painted by hand, these shapes are the spec.

Cost: ~12 KB for four WebP masks. Set `build.assetsInlineLimit` to 8192 so all
five inline and there are no extra requests (default is 4096; the masks land at
2–4 KB and would split arbitrarily).

**Device sizes are not a concern.** Largest render in the app is `VoteMark` at
`w-10` (40px); at 3× DPR that is 120 device px against a 256px mask, 2.1×
headroom. The nav at 20px is 4.3×. It never upscales; softening starts only past
~85px CSS at 3×. The honest caveat runs the other way — at 20px the painted edge
is nearly invisible, so the case for raster rests on the larger uses and on
matching the buffs by construction.

## The open fork

Both were rendered across My Season. **Painted plaque is the safe default.**

### 1 · Painted plaque
Hero, lane card and history are each a painted slab. One mechanism — a cream or
forest plaque at any size — that also paints the Tribal Council card in the
locked state and the section cards in the other three states.

### 4 · One panel
Hero on top, then a single painted slab holding everything, divided by brush
rules. Nearest to the one-sheet record the page had before #548.

**The argument for 1:** My Season has five states and only `open` has a lane
stack. `locked`, `watch_only`, `intermission` and `complete` are each a single
section under the same masthead, points chip and history card. *1 is a surface;
4 is a layout.* Picking 4 means designing `open` once and answering the other
four states separately — most likely with plaques anyway. 1 also keeps #548's
lane colour running from tab into header band, and is a re-skin of components
that already exist rather than a restructure of the lane stack.

**What 4 buys** is the one-sheet feeling, for one screen out of five. Worth
seeing running before deciding, hence the branch.

### A wrong argument, recorded so it isn't made twice
The first tie-breaker was the locked theme's lit-roster conceit — the jade lane
staying paper by firelight while everything else goes dark. That comparison was
of a screen that does not exist. `locked-night` is set for everyone (not just
admins) from `resolveMySeasonState(...).kind === 'locked'`, but My Season picks
its layout from the same call, so the theme and the lane stack are mutually
exclusive. See [#554](https://github.com/dtiern55/tribal-knowledge/issues/554).

## Open questions

- Which of plaque / one panel ships. Both are on the `painted-my-season`
  branch behind a preview toggle.

## Settled: the rule family

The painted two-colour dash was doing every dividing job — masthead, page
titles, section breaks, row separators — and at five a screen it stopped
reading as a signature. It now has exactly one job: the masthead, unchanged,
`brush-divider.png` as it ships.

Everywhere else a single-colour rule takes the colour of the lane or section
it belongs to, so a divider says where you are instead of decorating. Each is
`currentColor` painted through a mask, tinting like the icons and needing no
per-colour asset.

| Form | Job |
| --- | --- |
| Tapered stroke | The workhorse. Page titles in stone; a short one under the selected lane tab in that lane's colour, replacing #548's filled gradient band. |
| Cord lashing | The most Survivor-specific mark in the set. Advantage / gold. |
| Woven band | A heavier section break. |
| Hairline and blot | A quiet rule with one loaded end. |
| Torn band | The same bitten edge the plaques have, as a rule. |

Brush ticks were drawn and cut — they read as noise at the sizes the app uses.

Two implementation notes: marked rules (lashing, weave, torn band) **tile** at
their natural size rather than stretching, or a mark turns into a smear; and
the flat CSS `repeating-linear-gradient` in the Jungle Earth spec is *not* the
shipped divider — the shipped one is painted, and it stays painted.

## Related findings

- [#553](https://github.com/dtiern55/tribal-knowledge/issues/553) — the idol and
  medallion PNGs are 3.3 MB for badges that never render above 32px.
- [#554](https://github.com/dtiern55/tribal-knowledge/issues/554) — 56 lines of
  `locked-night .lane-stack` overrides are unreachable outside the admin theme
  override.

## Rendered references

- [Painted or Flat](https://claude.ai/code/artifact/cf9d2fa5-3159-4ac1-8e9e-eab364c51f04) — the four directions across all five pages, and the audit.
- [Paint the Main Event](https://claude.ai/code/artifact/66ddadae-05f2-4d18-9af0-599b38c95dfe) — card treatments, the plaque/panel fork, and the icon set in both routes.
