# App icon concepts (#221 / #222)

## 2026-08-12 decision

The permanent identity moved to a **three-seat fire ring** after a fresh icon
exploration. Three broad arcs surround the central flame: a gathering around
the Tribal Council fire and the final three seats at Final Tribal Council.
The production SVG lives at `frontend/public/favicon.svg`. Its asymmetric
diagonal flame cut adds some of the hand-carved personality of the earlier
tiki/fire hybrid without introducing a literal mask. The concepts below remain
the exploration history.

Two deterministic flame refinements remain under evaluation before release:

- `fire-ring-simple-flame.svg` — the first production translation, retained as
  the comparison control.
- `fire-ring-sculpted-flame.svg` — a carved canopy and separate inner ember.
- `fire-ring-carved-flame.svg` — an asymmetric diagonal cut inspired by the
  personality of the earlier tiki/fire hybrid without using a literal mask.

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
