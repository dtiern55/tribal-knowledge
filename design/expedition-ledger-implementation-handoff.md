# Expedition Ledger implementation handoff

**Status:** Ready for implementation  
**Prepared:** 2026-08-16

## Objective

Bring the approved Expedition Ledger visual language into the shipped interface without changing gameplay, scoring, privacy, API behavior, or the episode-state resolver.

The current branch already contains the underlying one-document My Season structure, functional Open and Locked compositions, a reveal dialog, accessible tabs, weekly-play behavior, and the two wax-seal sizes. Treat this as a visual refinement of working behavior rather than a page rewrite.

## Source of truth

Use these references in this order:

1. `design/expedition-ledger-visual-spec.md` — approved visual rules and state direction.
2. `design/artifacts/episode-states-open-locked.png` — approved Open/Locked material and lighting comparison.
3. `design/artifacts/episode-state-reveal.png` — approved Reveal atmosphere and scoring hierarchy.
4. Current code and tests — authoritative for behavior and gameplay.
5. `design/my-season-redesign.md` — earlier state and interaction exploration; where it differs visually, the newer Expedition Ledger specification wins.

The mockups use sample names and numbers. They are not pixel-perfect layout specifications and must not override live data, responsive behavior, or existing mechanics.

## Production artwork

| Asset | Location | Delivery | Intended use |
| --- | --- | --- | --- |
| Fine paper grain | `frontend/src/assets/expedition-paper-grain.webp` | 512 × 512 WebP, 2.7 KB | Repeating low-contrast fiber texture beneath live ledger content |
| Large wax seal | `frontend/src/assets/wax-2x.png` | 192 × 192 transparent PNG | Roster member at approximately 34 px |
| Small wax seal | `frontend/src/assets/wax-2x-small.png` | 96 × 96 transparent PNG | Compact beat summary at approximately 18–22 px |

Do not create a torch or candle asset. Locked lighting is entirely environmental and comes from off-screen right.

The raster paper file supplies only fine, homogeneous grain. Broad stains, watercolor clouding, creases, edge aging, shadows, and state lighting belong in CSS so they do not tile visibly.

## Typography migration

Update the font request in `frontend/index.html` and the theme definitions in `frontend/src/index.css`.

| Role | Approved face | Migration note |
| --- | --- | --- |
| Brand | Skranji | Keep exclusively on the `TRIBAL KNOWLEDGE` lockup |
| Display | Alegreya SC | Replace Anton for season titles, section headings, names, and state labels |
| Interface | Source Sans 3 | Use for body copy, controls, tabs, metadata, and scores |
| Handwriting | Kalam | Keep for ballot slips and rare handwritten annotations |
| Numbers | Source Sans 3 with tabular figures | Use for scores, ranks, timers, and scoring comparisons |

Avoid a global text-size reduction during the font swap. Alegreya SC is less visually dense than Anton and should be checked at actual mobile sizes before spacing is tightened.

## State implementation

### Phase 1 — shared material foundation

Primary files:

- `frontend/index.html`
- `frontend/src/index.css`
- `frontend/src/components/Layout.tsx`
- `frontend/src/components/SeasonRecord.tsx`

Work:

- Load Alegreya SC and Source Sans 3 and update the font tokens.
- Apply the paper-grain asset to `.record-paper`.
- Add reusable, non-repeating CSS layers for broad watercolor, quiet stains, restrained crease lines, edge shading, and paper shadow.
- Keep the surrounding page atmospheric but quieter than the ledger.
- Preserve the thin ember-to-jungle stripe as the strongest global accent.
- Replace the generic circular tab checks with hand-inked check treatment while retaining the accessible completion text.
- Keep live content, including names and scores, as HTML.

Exit criteria:

- the grain has no obvious repeated landmark at phone or desktop widths;
- body text remains easy to read over every texture layer;
- Open still feels like a conventional, usable application;
- no behavior or accessible-name tests change merely to accommodate styling.

### Phase 2 — My Season Open

Primary files:

- `frontend/src/pages/MySeasonPage.tsx`
- `frontend/src/components/SeasonRecord.tsx`
- `frontend/src/components/RosterCard.tsx`
- `frontend/src/components/VoteSlip.tsx`
- `frontend/src/index.css`

Work:

- Preserve the current one-record, three-beat interaction and mounted tab panels.
- Shift hierarchy from generic borders and boxes to paper, ink rules, spacing, and Alegreya SC headings.
- Give the selected roster member a restrained ocean watercolor wash and an ink edge.
- Keep ballot slips irregular but readable, with Kalam applied to real text.
- Keep controls recognizably modern and preserve current focus, hover, disabled, and loading behavior.
- Continue using the purpose-built large and small wax files at their existing semantic locations.

Do not change:

- roster, ballot, and Weekly Play mechanics;
- ballot pick limits;
- swap eligibility or cost;
- the distinction between Double Roster Points and Double Ballot Points;
- API calls, resolver precedence, or privacy boundaries.

### Phase 3 — Locked

Primary files:

- `frontend/src/index.css`
- `frontend/src/components/Layout.tsx`
- `frontend/src/pages/MySeasonPage.tsx`

Work:

- Retain `html.locked-night` as the global state hook.
- Shift the shell to deep ocean night.
- Keep the ledger warm and readable under an amber pool entering from off-screen right, with cool falloff toward the left.
- Use gradients, shadow, and restrained irregular illumination only. Do not render a visible torch, candle, flame, or handle.
- Present the committed roster, ballot, and Weekly Play as one sealed record rather than separate dark cards.
- Continue removing edit controls entirely in Locked instead of rendering a field of disabled controls.
- Use the wax asset for Double Roster Points rather than the current generic `×2` chip.

The existing `Torch` component remains valid for the loading indicator, Cast survival metaphor, and swapped-out history. This direction only prohibits an environmental light-source illustration in the Locked scene.

### Phase 4 — Reveal

Primary files:

- `frontend/src/components/EpisodeResultReveal.tsx`
- `frontend/src/index.css`

Work:

- Preserve the existing dialog semantics, focus management, acknowledgement flow, replay behavior, Escape handling, loading state, and error state.
- Replace the dark broadcast-card composition with the approved bright morning-after ledger.
- Make Roster, Ballot, and Weekly Play three visibly distinct scoring lanes.
- Use jungle ink for confirmed positive results and rust for negative values.
- Add a restrained ink-style `Results recorded` stamp; it is not wax and should not resemble a button.
- Keep the total and rank movement prominent without obscuring the three contributing lanes.
- Render optional insights only when supplied, as the current component already does.
- Support zero, one, or multiple eliminated castaways and zero or multiple correct ballot picks.

### Phase 5 — restrained global extension

After My Season is approved in-browser, extend only the shared foundation:

- Standings becomes a restrained ship ledger with ruled rows and tabular figures.
- Cast becomes a set of field dossiers with mounted portraits and small tribe washes.
- Menus and dialogs use clean paper surfaces and ink borders.
- Rules and administration inherit typography and color but receive minimal ornament.

Do not give every route the full My Season cinematic treatment.

## Responsive requirements

- Start at 320 px and verify there is no horizontal scrolling.
- Keep the current phone-first vertical flow.
- Preserve safe-area padding and the fixed bottom navigation.
- Test long season names, long castaway names, three ballot picks, multiple eliminations, and four-digit scores.
- Confirm the small wax seal at 18 px and 22 px and the large seal at 34 px on both standard- and high-density displays.
- On larger screens, allow more breathing room and wider scoring lanes; do not reveal a light-source illustration.

## Accessibility requirements

- Maintain current semantic tabs, dialog behavior, focus handling, and keyboard controls.
- Keep contrast compliant on textured paper and across the Locked light falloff.
- Do not encode Open, Locked, or Reveal through color alone; composition and text must also identify them.
- Keep text selectable and do not bake labels into artwork.
- Keep reduced-motion handling for reveal transitions and any optional light modulation.
- Do not put decorative pseudo-elements above interactive content in the stacking order.

## Verification

Run after each phase rather than waiting for the full reskin:

```bash
cd frontend
npm test -- --run
npm run build
```

At minimum, re-check:

- `frontend/src/components/Layout.test.tsx`
- `frontend/src/components/ContestantPortrait.test.tsx`
- `frontend/src/pages/MySeasonPage.test.tsx`
- reveal acknowledgement and replay tests;
- Locked compositions with and without a Weekly Play;
- Open ballot editing and tab keyboard navigation;
- reduced-motion mode;
- 320, 360, 736, and desktop widths.

Visual QA should compare against the approved references for atmosphere and hierarchy, not literal sample copy or exact pixel placement.

## Recommended review sequence

Keep implementation reviewable in four visual checkpoints:

1. Typography, tokens, paper grain, and shared chrome.
2. My Season Open.
3. Locked night and off-screen firelight.
4. Reveal and final cross-state polish.

Do not begin the restrained Standings/Cast extension until those four checkpoints are accepted.
