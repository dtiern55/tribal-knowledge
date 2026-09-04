# App icon concepts (#221 / #222)

## 2026-08-12 decision

The permanent identity moved to a **three-seat fire ring** after a fresh icon
exploration. Three broad arcs surround the central flame: a gathering around
the Tribal Council fire and the final three seats at Final Tribal Council.
The production SVG at that time used a forked outer silhouette with some of the
hand-cut personality of the earlier tiki/fire hybrid. The flame was also moved
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

The locked palette lives in `snakes-and-rats-locked.png`: cream textured ground,
forest-green rat, terracotta snake, and gold flame.

On 2026-09-03, the selected heavy-brush dark-canvas variation became the
installed, maskable, and Apple touch icon. The selected lighter-walnut variation
became the unlocked loading-screen puzzle; the locked loading puzzle remains
unchanged. Production exports live under `frontend/public`, and all five
selected originals remain available in the Admin comparison gallery.

The app wordmark follows those same roles on its dark surfaces: **SNAKES** is
terracotta, **AND** is gold, and **RATS** is cream. Keeping the connector in its
own flame color prevents it from reading as part of “RATS.”

## 2026-09-03 simple-animal favicon

The browser favicon is a separate flat identity. The full wood-burn
illustration, reduced rat/snake/flame micro-mark, and detailed character snake
all collapsed into indistinct color at 16px. The replacement uses the supplied
simple rat silhouette: cream on a solid forest field, with the supplied simple
snake retained as an alternate. The PNG and ICO exports share the same source;
installed and maskable app icons remain separate.

## 2026-09-04 brighter foreground study

Small-size review showed that lightening the forest background was less
effective than lifting the rat, flame, and snake themselves. The retained study
under `2026-09-04-brighter-foreground/` includes balanced and vivid heavy-canvas
passes plus coordinated dark and locked patchwork variants. The settled color
direction is warm ivory, luminous gold, and earthy burnt red; the locked
patchwork version keeps its green rat on the cream ground.

The current preferred heavy-canvas study is
`canvas-vivid-burnt-red-v2-lighter.png`. Its snake is a small value lift over
the first burnt-red pass so it remains red—not orange—without sinking into the
dark forest canvas. These are reference sources only; production exports were
not replaced as part of the study.

The follow-on `2026-09-04-dark-stitch-textures/` study revisits the dark
patchwork source specifically. One candidate swaps the dense foreground
micro-pattern for quiet woven textile relief while retaining the intricate
green ground. The other makes the three foreground forms literal fabric
appliqués with visible blanket stitching on a simpler dark-green weave. Both
keep the ivory, gold, and burnt-red palette and are preserved with a launcher-
size comparison board.

The selected dark patchwork direction is the quiet woven treatment with a
red-leaning burnt-orange/rust snake:
`2026-09-04-dark-stitch-textures/dark-patchwork-clean-woven-burnt-orange.png`.
The earlier burnt-red woven pass and the literal stitched appliqué remain next
to it as reference controls.

That selected clean-woven source became the production identity on 2026-09-04:
installed, maskable, Apple touch, and every in-app static icon now use it. The
slide-puzzle images deliberately remain the earlier light-walnut and fine-light
sources. A brief attempt to use the full mark as the browser favicon was
reverted the same day—the composition remained too complicated at 16–32px—so
the simple cream rat stays there. The `SNAKES / AND / RATS` wordmark now uses
bright source-image midtones (`#cd5e21` / `#f3b939` / `#f6e1ad`) for the snake,
flame, and rat roles respectively.
