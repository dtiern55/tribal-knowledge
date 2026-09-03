# App icon concepts (#221 / #222)

## 2026-08-12 decision

The permanent identity moved to a **three-seat fire ring** after a fresh icon
exploration. Three broad arcs surround the central flame: a gathering around
the Tribal Council fire and the final three seats at Final Tribal Council.
The production SVG lives at `frontend/public/favicon.svg`. Its forked outer
silhouette keeps some of the hand-cut personality of the earlier tiki/fire
hybrid while remaining legible at favicon size. The flame was also moved
slightly left and down for optical centering. The concepts below remain the
exploration history.

Deterministic flame silhouettes explored during refinement:

- `fire-ring-simple-flame.svg` — the first production translation, retained as
  the comparison control.
- `fire-ring-sculpted-flame.svg` — a carved canopy and separate inner ember.
- `fire-ring-carved-flame.svg` — an asymmetric diagonal cut inspired by the
  personality of the earlier tiki/fire hybrid without using a literal mask.
- `fire-ring-solid-flame.svg` — the simplest single-flame silhouette.
- `fire-ring-inner-ember.svg` — a classic flame with a lighter inner ember.
- `fire-ring-forked-flame.svg` — the selected production refinement: one
  continuous silhouette with a small secondary lick on the outer edge.

Flat app-icon directions explored 2026-07-21. **Tiki-bigger was the shipped
choice at that time**; the two idols are kept here for potential later use.

| File | Direction | Notes |
|------|-----------|-------|
| `tiki-bigger.svg` | The tiki, scaled to fill (~85%) with its teeth back | **Shipped** as the app icon — fixes the "reads ~30% small" problem (#222). Season-neutral. |
| `cagayan-idol.svg` | Gold carved mask on dark wood | Warm, fierce, ties to the Cagayan season. Season-specific. |
| `tocantins-idol.svg` | Bone skull inside an angular maze ring | Boldest, reads best at tiny sizes. Season-specific. |

An idol is a natural fit for the **Advantages** tab glyph (advantages *are*
hidden immunity idols) — possibly tracking the current season — if we revisit.

Concept board: https://claude.ai/code/artifact/eb296bee-0d12-4997-be79-2d51f01768b2
SVGs are 512×512, palette-matched to the app (ocean/ember/cream/gold/bone).

## 2026-08-18 Jungle Earth update

The three-seat fire ring remains the app identity, but its production palette
now follows the Jungle Earth system: forest ground, cream council ring,
terracotta flame, and a gold inner ember. The ring is slightly larger and the
flame is nudged right for better optical centering. This keeps the established
Final Tribal meaning and small-size silhouette while bringing the icon into the
same visual world as the application.

## 2026-08-30 Snakes and Rats identity

The app is now named **Snakes and Rats**, with a new mark inspired by Sue Hawk's
season-one Tribal Council speech. A cream rat and terracotta snake frame a gold
hidden flame on the established forest-green textured canvas. The final source
art is `snakes-and-rats-final.png`. Its snake keeps the more aggressive middle
curve and green cut-through from the exploration while the last curve resolves
directly into the flame base without the lower coil.

The locked loading-screen palette lives in `snakes-and-rats-locked.png`: cream
textured ground, forest-green rat, terracotta snake, and gold flame. Production
favicon, app-icon, maskable-icon, and both current sliding-puzzle exports live
under `frontend/public`; the earlier fire-ring puzzle exports remain there for
the four-way admin preview.

The app wordmark follows those same roles on its dark surfaces: **SNAKES** is
terracotta, **AND** is gold, and **RATS** is cream. Keeping the connector in its
own flame color prevents it from reading as part of “RATS.”

## 2026-09-03 coiled-snake favicon

The browser favicon is a separate flat identity at
`frontend/public/favicon.svg`. The full wood-burn illustration and a reduced
rat/snake/flame micro-mark both collapsed into indistinct color at 16px. The
replacement is one friendly terracotta snake on a solid forest field, inspired
by a supplied coiled-snake reference. An oversized head, two high-contrast eyes,
an upright neck, a broad two-level coil, and one cream band carry the entire
read at 16px. It is drawn on a 64-unit grid with no paper grain, shading, scales,
tongue, or secondary objects. The ICO uses the same geometry; installed and
maskable app icons remain separate.
