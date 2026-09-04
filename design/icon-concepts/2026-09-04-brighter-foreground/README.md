# Brighter foreground study

The two exploratory edits keep the selected heavy dark canvas direction:

- `bright-foreground-v2-balanced.png` uses a moderate parchment, terracotta,
  and gold lift.
- `bright-foreground-v1.png` tests the vivid endpoint: warm ivory rat,
  coral-orange snake, and luminous yellow-gold flame.

Neither is a production export.

The coordinated burnt-red study adds three candidates:

- `canvas-vivid-burnt-red.png` applies the preferred vivid lift to the heavy
  canvas icon and moves the snake from coral-orange to the first, dark
  burnt-red pass. It is retained as the comparison control.
- `canvas-vivid-burnt-red-v2-lighter.png` is the selected refinement: the same
  burnt-red family with a very small value lift so the snake separates from
  the forest canvas without drifting back toward orange.
- `patchwork-unlocked-bright-burnt-red.png` carries the ivory, gold, and
  burnt-red treatment onto the dark patchwork source.
- `patchwork-locked-bright-burnt-red.png` keeps the inverse locked palette,
  with a clearer forest rat, gold flame, and burnt-red snake.

`burnt-red-set-comparison.png` checks the latest candidate in each family
against its source at 64 and 256 pixels. Rebuild it with:

```bash
uv run --with pillow python \
  design/icon-concepts/2026-09-04-brighter-foreground/make_burnt_red_comparison.py
```

`bright-foreground-comparison.png` compares it with the current selected source
at 48, 64, 128, and 256 pixels. Rebuild it with:

```bash
uv run --with pillow python \
  design/icon-concepts/2026-09-04-brighter-foreground/make_comparison.py
```
