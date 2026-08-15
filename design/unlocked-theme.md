# Unlocked-state visual theme

**Status:** Direction selected; implementation deferred to a follow-up issue  
**Decision date:** 2026-08-15  
**Related:** #380, #327, #358

## Decision

Use a **restrained coastal-carved** theme for the normal unlocked state.

Keep the existing Borneo palette and warm daylight posture. Add character at
the shell and section-boundary level: an ocean-blue masthead, warm paper-like
content surfaces, and a small geometric carved motif on selected dividers and
active navigation states. Gameplay controls remain clean, solid, and familiar.

This is a combination of the explored materials, but not a literal collage:

- **Wood** contributes warmth and craft, limited to an occasional structural
  accent rather than a repeating page texture.
- **Parchment** contributes the warm paper color and quiet tactility, without
  distressed edges, stains, or faux aging.
- **Carved tribal detail** contributes a simple geometric rhythm used as
  punctuation, never as a content background or a new icon language.

The locked nighttime theme remains unchanged. This direction applies only to
normal unlocked states.

## Directions compared

### Wood frame

Dark wood grain in the masthead and mobile navigation gives the app an
immediate crafted, island-camp character. It also makes persistent navigation
visually heavy, competes with the brand colors, and can read as a generic game
texture when repeated. It is strongest as a sparse accent, not the foundation.

### Parchment field

A parchment-colored content field is warm, readable, and compatible with the
existing sand palette. Literal grain, deckled edges, or stains quickly become
decorative noise and make repeated forms feel like props. Keep the color and
subtle tonal variation; reject the costume treatment.

### Coastal carved

The selected direction keeps the ocean and jungle identity in the shell,
retains clean paper surfaces for gameplay, and uses a small carved geometry at
section transitions. It has the clearest hierarchy across both the task-heavy
My Season screen and the scan-heavy Standings screen. It also preserves the
approved monochrome, current-color icon system instead of introducing tiki
faces as general-purpose glyphs.

## Representative-screen findings

### My Season — open

- The ballot remains the dominant decision; texture never sits behind names,
  selection states, or the Save action.
- The carved motif can distinguish a section transition without adding another
  bordered card.
- Weekly play remains a parallel decision and does not visually merge with the
  ballot.
- Ember remains a small state/accent color; jungle remains the save/success
  action color.

### Standings

- Warm paper and quiet dividers support dense scanning better than wood-backed
  rows or individually framed parchment cards.
- The current player may keep a restrained ocean tint and explicit “You” label;
  the theme does not become the status signal.
- Rank, player, and points hierarchy remains typographic rather than decorative.

## Visual rules for implementation

1. **No texture behind interactive content.** Inputs, contestant rows, tables,
   notices, and primary actions use flat high-contrast surfaces.
2. **One carved moment per section at most.** Use it as a divider, selected-nav
   edge, or small heading ornament—not all three in the same component.
3. **No new pictogram family.** Continue using the custom monochrome SVG icons
   in `frontend/src/components/icons.tsx`; tiki or mask imagery is decorative
   art only, not navigation semantics.
4. **No literal aged-paper effects.** Avoid stains, torn edges, folds, burned
   corners, and low-contrast brown body text.
5. **Do not theme by wrapping everything in cards.** Preserve the hierarchy in
   `design/ux-foundation.md`: spacing, headings, and dividers first.
6. **Keep state separate from material.** Saved, dirty, selected, locked, and
   error states retain copy, shape, and semantic color cues.
7. **Never apply this layer to locked night.** `html.locked-night` remains the
   authoritative visual branch and must win over any unlocked-theme selectors.
8. **Keep decorative CSS non-blocking.** The first paint uses solid existing
   colors; any optional texture must be CSS-only, tiny, and nonessential.

## Proposed token direction

Reuse the shipped `ocean`, `jungle`, `sand`, and `ember` scales. A follow-up
implementation may add only semantic aliases such as shell, paper, divider,
and carved-accent if doing so removes repetition. It should not add a parallel
palette or bitmap texture assets.

The likely first slice is the shared unlocked shell plus one representative
content section. Do not sweep every `bg-white` or border utility globally;
explicit component-level adoption protects admin density, loading states, and
the locked-night override.

## Acceptance checks for the implementation issue

- Verify 320 × 568, 768 × 1024, and 1280 × 800.
- Check My Season Open, Standings, Cast, loading, empty, and error states.
- Confirm the locked state is pixel-for-pixel unaffected outside intentional
  shared fixes.
- Confirm text, selection, focus, disabled, and error contrast meets WCAG AA.
- Confirm the shell and first useful content paint without external texture or
  image requests.
- Confirm custom navigation icons still inherit active and inactive colors.

## Explicitly rejected

- Full-page or row-level wood grain.
- Distressed parchment as the primary reading surface.
- Literal tiki masks as section or navigation icons.
- Decorative ropes, bamboo frames, torn edges, and drop-shadow-heavy cards.
- Any theme rule that overrides the locked nighttime state.
