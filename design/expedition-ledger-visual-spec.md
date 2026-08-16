# Expedition Ledger visual specification

**Status:** Approved direction for design handoff  
**Last updated:** 2026-08-16

## Purpose

Tribal Knowledge should feel like a watercolor expedition record assembled by torchlight: paper, ink, wax, ocean, jungle, and restrained maritime details. It should depart clearly from generic white cards without turning every control into a theatrical prop.

This brief defines the visual system. It does not change gameplay, application behavior, or scoring rules.

## Scope and hierarchy

- **Global foundation:** typography, colors, page atmosphere, navigation treatment, paper surfaces, ink rules, and shared state cues.
- **My Season:** the deepest narrative treatment. It is the player's working expedition ledger and the focal point of the redesign.
- **Standings:** a restrained ship's ledger with ruled rows and tabular scores.
- **Cast:** field dossiers with mounted portraits, inked names, and small watercolor tribe markers.
- **Menus and dialogs:** clean paper panels with ink borders. Avoid torn edges, wax, and decorative props.
- **Rules and administration:** readable documents that inherit typography and color, with minimal artwork.

My Season may feel cinematic. Other routes should belong to the same world without competing with it.

## Visual principles

1. **Editorial before ornamental.** Type, spacing, lighting, and hierarchy carry most of the design.
2. **Materials have meaning.** Paper holds information, watercolor shows selection or atmosphere, ink records decisions, and wax represents a committed weekly play.
3. **One strong gesture at a time.** Firelight, a wax seal, ballot slip, or decorative divider should be a focal accent rather than repeating wallpaper.
4. **Real interface text remains real text.** Do not bake names, scores, labels, or instructions into artwork.
5. **States change the environment.** Open, Locked, and Reveal should not be the same card with different badges.
6. **Gameplay concepts remain distinct.** Roster, Ballot, and Weekly Play must never be visually or verbally conflated.

## Typography

| Role | Typeface | Use |
| --- | --- | --- |
| Brand | Skranji | `TRIBAL KNOWLEDGE` wordmark only |
| Display | Alegreya SC | Season titles, section headings, and important state labels |
| Interface | Source Sans 3 | Body text, tabs, buttons, forms, and supporting labels |
| Handwriting | Kalam | Ballot slips and rare handwritten annotations |
| Numbers | Source Sans 3 with tabular figures | Scores, rankings, timers, and numeric comparisons |

Avoid using the display face for long instructions or dense data. Handwriting is an accent, not a second body font.

## Color and material roles

- **Paper:** warm cream and sand surfaces; never generic white for primary records.
- **Ink:** near-black warm brown for normal text and rules.
- **Ocean:** headings, selected states, and cool watercolor washes.
- **Jungle:** confirmed positive results and earned points.
- **Ember:** active navigation, rough underlines, and firelight accents.
- **Aged gold:** lock timing and committed-state notes.
- **Rust:** negative points and warning marks.
- **Wax red:** weekly plays only. Do not reuse wax styling as a general badge system.

Texture should remain quiet beneath text. Strong watercolor belongs around a selection or in the surrounding atmosphere, not behind every row.

Use a hybrid paper treatment: one subtle, landmark-free raster grain supplies fine fibers, while broad stains, watercolor clouding, restrained crease lines, lighting, and edge shading are layered with CSS. This prevents obvious repetition and lets the same paper respond differently to each episode state.

## Episode-state atmosphere

### Open — daylight preparation, intensity 2/5

- Warm, calm expedition-paper environment.
- Subtle corner washes of ember, ocean, or jungle.
- Controls remain clearly interactive and conventional.
- Selected content receives a restrained ocean wash and ink edge.
- Lock timing uses aged gold.
- Weekly Play remains visibly optional and changeable until lock.

Open should feel inviting and legible, not unfinished.

### Locked — nighttime torchlight, intensity 4/5

- The global app environment changes to deep ocean-night.
- The My Season ledger remains warm and readable inside a directional pool of amber firelight arriving from off-screen right.
- Do not show a torch, candle, flame, handle, or other visible light source.
- Header and bottom navigation join the night palette.
- Committed ballot and Weekly Play remain visible; editing controls disappear rather than becoming a field of disabled buttons.
- Wax reads as sealed and final.

The viewpoint should imply that the player holds the ledger in the left hand while using a torch or candle in the right. Convey that story only through directional warmth, falloff, and shadow. Other routes receive the nighttime palette and a restrained version of the glow.

### Reveal — vivid aftermath, intensity 5/5

- Treat Reveal as the morning-after record: brighter tropical light, stronger ocean-and-jungle watercolor, and freshly recorded results.
- Make roster points, ballot points, and Weekly Play bonus visibly separate scoring lanes.
- Use hand-inked checks, score marks, and a restrained `Results recorded` stamp.
- Emphasize earned values with jungle ink; use rust for negative values.
- Aggregate pick statistics appear only after scoring and only when supplied by the product.

The full-screen morning-after composition is approved: brighter paper, stronger ocean-and-jungle watercolor, separated scoring lanes, and a restrained results stamp distinguish Reveal from both Open and Locked.

### Excluded and future states

- No Intermission visual state is required for the current app.
- Complete is a useful future state but is outside the present design scope.

## Global app chrome

- Preserve the familiar structure of the header, menu, and bottom navigation.
- Use warm paper tones during Open and Reveal.
- Shift header and navigation to deep ocean-night during Locked.
- Retain the thin torch-to-jungle stripe as the strongest global accent.
- Mark the active destination with ember ink and a rough underline.
- Keep parchment tears, wax, and illustrated objects inside content areas rather than applying them to every navigation item.

## Component treatments

### Primary record

- One readable ledger surface rather than several nested cards.
- Warm paper with a quiet grain, thin ink rules, and a slightly irregular outer edge.
- Section hierarchy comes from Alegreya SC, spacing, and rules—not boxes around every subsection.

### Tabs

- Plain text labels on the record edge.
- Active tab receives an ember brush underline.
- Saved state uses a hand-inked check, not a generic green circle icon.
- A small wax seal may accompany the episode-level Weekly Play summary, but it must not compete with the active tab.

### Roster rows

- Portraits feel mounted to the page rather than placed in generic cards.
- Names use the display face; tribe and metadata use the interface face.
- A selected roster member receives an ocean watercolor wash and an ink edge.
- Scores remain mostly dark ink before Reveal and become jungle ink when confirmed.
- The large `2×` wax seal belongs beside the affected castaway; the smaller seal is reserved for compact summaries.

### Ballot

- Saved names appear on irregular paper slips with live Kalam text layered over the artwork.
- Slips may rotate slightly within a narrow range, but must remain easy to scan.
- Correctness and points are applied after Reveal; no popularity or league-choice information appears before scoring.

### Weekly Play

- Present one optional play per episode with three accurate choices: Double Roster Points, Double Ballot Points, or a paid Roster Swap when applicable.
- Double Ballot Points doubles all correct elimination-pick points for the episode. It does not add a pick or target one ballot selection.
- A played double is represented by wax. A free roster swap does not consume or display the Weekly Play as used.

### Buttons, forms, and dialogs

- Primary actions use jungle ink/fill; active navigation uses ember.
- Secondary actions use paper with an ink border.
- Lock notes use aged gold.
- Preserve familiar control geometry and accessibility. The historical character should come from materials and type rather than making controls difficult to recognize.

## Artwork checklist

| Priority | Asset | Recommended delivery | Production notes |
| --- | --- | --- | --- |
| P0 | Large `2×` wax seal | Transparent PNG, 384–512 px square | Irregular silhouette, shallow embossed `2×`, old wax character, slight rotation, readable around 34 px |
| P0 | Small `2×` wax seal | Transparent PNG, purpose-built around 96–192 px | Simplified relief and stronger numeral for 18–22 px display; do not merely shrink the large seal |
| P0 | Paper-grain tile | Seamless PNG or WebP, 512 px square | Very low contrast; no obvious repeating stain; suitable beneath live text |
| P1 | Ballot-slip silhouette | SVG with transparent exterior | Irregular but restrained torn edge; real text remains HTML; supports flexible name lengths |
| P1 | Braided or hand-ink divider | Repeatable SVG, approximately 600 × 24 px | One restrained separator motif; must survive at mobile width and in Locked colors |
| P2 | Ink ornament set | SVG, two or three small motifs | Compass tick, route mark, or botanical flourish; use sparingly and never behind essential content |

### Artwork constraints

- Export with transparent breathing room and a centered visual subject unless the asset is intentionally edge-cropped.
- Test every asset at its smallest real display size, not only at source resolution.
- Supply high-density sources for modern phone displays.
- Keep lighting direction consistent: Locked-state firelight enters from off-screen right and falls toward the left.
- Avoid embedded words or numbers except the `2×` seal impression.
- Favor watercolor, dry ink, uneven pressure, and handmade edges over photorealistic props or polished game UI.
- Optimize final assets after approval; source masters may remain larger.

## CSS-owned effects

The following should not require unique raster artwork:

- Open, Locked, and Reveal background gradients;
- directional off-screen firelight, falloff, and subtle irregular illumination;
- broad stains, watercolor clouding, and restrained crease lines layered above the raster grain;
- ocean and jungle selection washes;
- paper shadows and subtle edge darkening;
- ember active underlines;
- ink rules and score emphasis;
- component spacing, layout, and responsive behavior.

## Responsive and accessibility requirements

- Design mobile-first down to 320 px without horizontal scrolling.
- Keep all live text selectable and screen-reader accessible.
- Maintain readable contrast on textured paper and inside torchlit scenes.
- Keep the brightest glow away from names, scores, and controls.
- Do not introduce a visible light-source illustration at larger breakpoints.
- Honor reduced-motion preferences by disabling any light modulation and reveal transitions.
- Do not depend on color alone: pair state colors with labels, marks, or layout changes.
- Validate the two wax seals at their actual 18–22 px and 34 px uses.

## Implementation order

1. Establish typography, palette, paper, ink rules, and global chrome.
2. Produce and validate the P0 artwork assets.
3. Apply the deep ledger treatment to My Season Open.
4. Add the global Locked-night environment and My Season's off-screen right-hand firelight.
5. Build the provisional Reveal composition and test it at full-screen mobile scale.
6. Extend the restrained foundation to Standings, Cast, dialogs, Rules, and administration.
7. Perform accessibility, reduced-motion, asset-weight, and small-screen QA.

## Acceptance test

The direction succeeds when:

- a screenshot is unmistakably Tribal Knowledge without relying on the logo;
- Open, Locked, and Reveal can be identified without reading a status badge;
- Locked feels like a warm ledger viewed at night by torchlight;
- Reveal feels more vivid and consequential than Open;
- the interface remains immediately understandable as a modern mobile app;
- Roster, Ballot, and Weekly Play remain mechanically and visually distinct;
- decorative artwork never interferes with names, scores, controls, or privacy boundaries.

## Reference artifacts

- `design/artifacts/episode-states-open-locked.png`
- `design/artifacts/episode-state-reveal.png`
- `design/artifacts/expedition-style-02-ledger.png`
- `design/artifacts/expedition-style-03-cinematic.png`
- `design/artifacts/expedition-ledger-style-board.png`
- `design/artifacts/my-season-open-expedition-ledger.png`
- `frontend/src/assets/expedition-paper-grain.webp`
- `frontend/src/assets/wax-2x.png`
- `frontend/src/assets/wax-2x-small.png`
