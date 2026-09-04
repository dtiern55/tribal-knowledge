# Source art

Full-resolution originals behind the images shipped under `frontend/public`
and `frontend/src/assets`. Edit a source here, re-run the export, commit both.

| Source | Feeds |
|--------|-------|
| `app-icon.png` | `icon-512.webp`, `icon-192.webp`, `icon-512-maskable.webp`, `apple-touch-icon.png` |
| `favicon-rat.png` | `favicon-16x16.png`, `favicon-32x32.png`, `favicon.ico` (recolored cream on forest) |
| `puzzle-unlocked-walnut.png` | `puzzle-wood-solid.webp` (unlocked loading puzzle) |
| `puzzle-locked-fine-light.png` | `puzzle-wood-light.webp` (locked loading puzzle) |
| `sole-survivor-medallion-teeth-skull-flat-larger.png` | `src/assets/…medallion….webp` (My Season) |
| `weekly-advantage-idol-dimensional.png` | `src/assets/weekly-advantage-idol-dimensional.webp` (DoubleBadge) |

```bash
uv run --with pillow python design/source-art/export_icons.py   # add --app-only to skip puzzle + favicon
```

The identity is **Snakes and Rats** (2026-08-30): cream rat, rust snake, gold
flame on a woven forest-green ground. The favicon is a separate flat cream rat
because the full mark is unreadable at 16–32px. Wordmark colors:
`#cd5e21` snake / `#f3b939` flame / `#f6e1ad` rat.

Every rejected direction, comparison board, and the dated decision log live
outside the repo in `../../design-archive/icon-concepts/`.
