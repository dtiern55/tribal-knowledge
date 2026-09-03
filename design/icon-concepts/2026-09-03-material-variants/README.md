# App icon finalists

Four Snakes & Rats app-icon options are retained for review at the bottom of
the Admin page. Production icon assets are not changed by this study.

## Final sources

- `heavy-brush-unlocked-70-30.png` — cream, terracotta, and gold heavy brush
  paint on deep forest canvas. Its background is 70% anchored to the original
  dark study and 30% toward the earlier midpoint.
- `heavy-brush-locked.png` — forest, terracotta, and gold heavy brush paint on
  warm cream canvas.
- `darker-real-walnut.png` — the stained / pyrographed mark on deep natural
  walnut.
- `darker-real-walnut-lighter.png` — the same walnut direction with a modest
  background lift for phone displays.
- `admin-icon-finalists-contact-sheet.png` — all four options with launcher-
  size checks.

`export_admin_options.py` generates the optimized 640px WebP assets in
`frontend/public`. `make_admin_options_sheet.py` rebuilds the review board.

```bash
uv run --with pillow python \
  design/icon-concepts/2026-09-03-material-variants/export_admin_options.py

uv run --with pillow python \
  design/icon-concepts/2026-09-03-material-variants/make_admin_options_sheet.py
```

## Built-in ImageGen prompt set

### Shared snake-tail refinement

> Shorten only the orange-red snake's terminal point by roughly 40-45 source
> pixels so it ends at the flame's bottom vertex. The snake should appear to
> sink into and originate from that shared base, while the mouse and its long
> thin tail remain completely unchanged. Preserve every other contour,
> texture, color, light, crop, and spacing detail.

### Canvas · Unlocked (70/30)

> Starting from the original heavy-brush unlocked study, lighten only its deep
> forest-green woven-canvas background by 30% of the tonal distance toward the
> midpoint study. Keep the result 70% visually anchored to the original and
> only 30% toward the midpoint. Preserve the original canvas weave, cream rat,
> terracotta snake, gold flame, heavy directional brush ridges, dry-brush
> edges, crop, positions, proportions, negative spaces, and contours. Do not
> average or morph the painted artwork with the midpoint reference.

### Canvas · Locked

> Render the rat, snake, and three-part flame as bold, heavy, visibly hand-
> painted brush strokes laid directly over warm cream woven canvas. Use broad
> natural-bristle strokes with tactile ridges, directional sweep, occasional
> dry-brush gaps, and subtle paint buildup. Preserve the exact locked palette
> and original composition. It must read as paint—not embroidery, stitching,
> yarn, appliqué, printing, carving, or wood. Do not copy the reference's
> retired fire-ring design or any puzzle geometry. Preserve the small pointed
> canvas-colored indentation on the lower-left inside edge of the snake's
> middle S-curve; this slit is part of the approved snake silhouette.

### Walnut · Dark

> Change only the wooden material treatment of the rat, snake, and three-part
> flame icon. Use darker, richer realistic walnut with visible natural flowing
> grain, organic cathedrals and fibers, a deep chocolate-brown tone, and a
> restrained matte finish. Keep the colored shapes stained / pyrographed and
> preserve the exact crop, placement, negative spaces, contours, and palette.

### Walnut · Lighter

> Lighten only the continuous dark-walnut background by a modest 10–12% in
> perceived brightness, moving from near-black chocolate walnut to a slightly
> warmer, more readable medium-dark walnut. Preserve the natural grain, matte
> finish, colored stained-wood shapes, burned outlines, crop, positions,
> proportions, negative spaces, and contours exactly.
