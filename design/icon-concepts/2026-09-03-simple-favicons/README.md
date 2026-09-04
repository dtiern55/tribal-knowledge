# Simple favicon set

The simple rat remains the production browser favicon. A 2026-09-04 attempt to
use the full clean-woven rat/snake/flame mark was reverted because the complete
composition still became too complicated at 16–32 pixels.

The browser favicon uses the supplied `rat-original.png` artwork. Its bold,
single-color silhouette stays recognizable at 16px, unlike the full rat,
snake, and flame illustration. The supplied `snake-original.png` is retained as
an alternate.

`export_themed_icons.py` preserves the supplied geometry and subtle foreground
lighting while applying the app palette: cream-200 through cream-50 for the rat
or terracotta-600 through terracotta-300 for the snake, both on forest-600. The
original baked-in black corners become real transparency so no dark fringe
appears around the rounded field.

Generate the production PNG and ICO assets with:

```bash
uv run --with pillow python \
  design/icon-concepts/2026-09-03-simple-favicons/export_themed_icons.py
```

The rat is the production default. To export the retained snake alternate, add
`--mark snake`.
