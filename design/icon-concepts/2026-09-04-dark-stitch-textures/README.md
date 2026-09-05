# Dark stitch texture study

This study keeps the bright ivory, gold, and burnt-red foreground palette on a
dark forest textile ground while reducing the dense dark pattern that muddied
the animal and flame silhouettes at launcher size.

- `dark-patchwork-clean-woven.png` retains the original intricate background
  but replaces the foreground interiors with quieter, low-contrast woven
  textile relief. Its snake is the first burnt-red colorway.
- `dark-patchwork-clean-woven-burnt-orange.png` was the selected direction. It
  keeps the clean woven treatment and moves only the snake to a slightly
  lighter, red-leaning burnt orange/rust, still well separated from the gold
  flame. As of 2026-09-04 it supplies the installed, maskable, Apple touch, and
  in-app icon exports until the 2026-09-05 flatter-canvas refinement. The
  browser favicon remains the simple rat, and the
  slide-puzzle sources remain unchanged.
- `dark-patchwork-stitched-applique.png` treats each foreground form as a
  separate, slightly raised fabric patch with visible blanket stitching. Its
  background is a simpler green weave so the appliqué construction reads
  immediately.
- `dark-stitch-texture-comparison.png` shows the dense-texture control, both
  clean-woven colorways, and the stitched alternative at 48, 64, 128, and 256
  pixels.

Rebuild the comparison with:

```bash
uv run --with pillow python \
  design/icon-concepts/2026-09-04-dark-stitch-textures/make_comparison.py
```

`production-export-preview.png` visually checks the standard, maskable, Apple
touch, browser favicon, and wordmark-color outputs. Rebuild it with:

```bash
uv run --with pillow python \
  design/icon-concepts/2026-09-04-dark-stitch-textures/make_production_preview.py
```

The PNGs in this directory are versioned source/reference files. Production-
sized derivatives are generated under `frontend/public`.

The wordmark uses bright midtones sampled from the selected textured source so
it keeps the same three color roles on dark app surfaces:

- snake / `SNAKES`: `#cd5e21`
- flame / `AND`: `#f3b939`
- rat / `RATS`: `#f6e1ad`

Re-sample those values from the selected source with:

```bash
uv run --with pillow python \
  design/icon-concepts/2026-09-04-dark-stitch-textures/sample_brand_palette.py
```
