# Simple favicon set

The browser favicon uses the supplied `snake-original.png` artwork. Its bold,
single-color silhouette stays recognizable at 16px, unlike the full rat,
snake, and flame illustration.

`export_themed_icons.py` preserves the supplied geometry and subtle foreground
lighting while applying the app palette: terracotta-600 through
terracotta-300 on forest-600. The original baked-in black corners become real
transparency so no dark fringe appears around the rounded field.

Generate the production PNG and ICO assets with:

```bash
uv run --with pillow python \
  design/icon-concepts/2026-09-03-simple-favicons/export_themed_icons.py
```
