# Modern enamel surface

The production app-icon surface since 2026-09-05. It answers the launcher-size
flatness problem without redesigning the Snakes and Rats mark: the rat, flame,
and snake geometry comes from the approved heavy-canvas artwork; only the
surface treatment changes.

The treatment removes the heavy canvas/impasto relief and replaces it with
smooth, saturated gradients, a restrained center glow, and soft grounding
shadows. The result borrows the visual clarity of contemporary app icons while
keeping the established forest, ivory, gold, and burnt-red brand roles.

- `masks/rat.png`, `masks/flame.png`, `masks/snake.png` are the frozen binary
  masks, segmented once from
  `../2026-09-04-brighter-foreground/canvas-vivid-burnt-red-flatter-background.png`.
  They are the approved geometry: eyes, forked tongue, tail, and negative
  spaces included. Surface treatments read them and never redraw them.
- `modern-enamel-source.png` is the full-resolution app-icon source.
- `modern-enamel-maskable-source.png` is the same render with the masks shrunk
  to 75% for Android's maskable safe zone; it supplies `icon-512-maskable.webp`.
- `modern-enamel-comparison.png` compares the treatment with the previous
  heavy-canvas icon at presentation and launcher sizes.

Re-render the surface (reads the frozen masks only):

```bash
uv run --with pillow --with numpy --with scipy python \
  design/icon-concepts/2026-09-05-modern-enamel/make_modern_enamel.py
```

`--freeze-masks` re-segments the heavy-canvas source and overwrites `masks/`.
That changes the approved geometry, so it is not part of a surface update.

Production exports under `frontend/public` are rebuilt from these sources with
`../2026-09-02-wood-block-burn/export_app_icons.py --app-only`. The browser
favicon and slide-puzzle sources are unaffected.
