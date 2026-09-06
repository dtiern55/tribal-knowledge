# Modern enamel surface

The production app-icon surface since 2026-09-05. It answers the launcher-size
flatness problem without redesigning the Snakes and Rats mark: smooth,
saturated gradients, a restrained center glow, and soft grounding shadows
replace the heavy canvas relief while keeping the forest, ivory, gold, and
burnt-red brand roles.

## Approved visual source

`modern-enamel-approved.png` is the exact generated concept Danny selected in
chat on 2026-09-05. Any production promotion following that selection must use
this image as its visual source. `modern-enamel-source.png` is the earlier
deterministic mask-based alternate and is not the selected artwork; it is kept
only as a reference and nothing generates it any more.

## Files

- `modern-enamel-approved.png` is the app-icon source, exported as-is.
- `masks/rat.png`, `masks/flame.png`, `masks/snake.png` are the approved
  geometry, segmented once from the approved image by hue and frozen. Any later
  surface treatment reads them and never redraws the forms.
- `modern-enamel-maskable-source.png` is the approved art shrunk to 75% for
  Android's maskable safe zone, laid over its own reconstructed background with
  the grounding shadow re-applied. It supplies `icon-512-maskable.webp`.
- `modern-enamel-comparison.png` compares the approved treatment with the
  previous heavy-canvas icon at presentation and launcher sizes.

Rebuild the maskable source and comparison (reads the frozen masks only):

```bash
uv run --with pillow --with numpy --with scipy python \
  design/icon-concepts/2026-09-05-modern-enamel/make_modern_enamel.py
```

`--freeze-masks` re-segments the approved image and overwrites `masks/`. Only
run it if the approved image itself changes.

Production exports under `frontend/public` are rebuilt from these sources with
`../2026-09-02-wood-block-burn/export_app_icons.py --app-only`. The browser
favicon and slide-puzzle sources are unaffected.
