# App icon finalists

Five Snakes & Rats app-icon options are retained for review at the bottom of
the Admin page.

These files are the exact versions selected from the design conversation on
September 3, 2026. Do not regenerate them or make further geometry edits when
rebuilding the gallery.

`selected-canvas-heavy-dark.png` is also the production installed app icon.
`selected-walnut-light.png` supplies the unlocked loading-screen puzzle. Their
dedicated frontend exports are built by `../2026-09-02-wood-block-burn/export_app_icons.py`.

## Selected sources

- `selected-canvas-woven.png` — fine woven texture on deep forest canvas.
- `selected-canvas-heavy-dark.png` — heavy brush texture on deep forest canvas.
- `selected-canvas-heavy-light.png` — heavy brush texture on lighter forest canvas.
- `selected-walnut-dark.png` — the stained / pyrographed mark on deep walnut.
- `selected-walnut-light.png` — the same walnut direction with a brighter ground.
- `admin-icon-finalists-contact-sheet.png` — all five choices with launcher-size checks.

`export_admin_options.py` generates the optimized 640px WebP assets in
`frontend/public`. `make_admin_options_sheet.py` rebuilds the review board.

```bash
uv run --with pillow python \
  design/icon-concepts/2026-09-03-material-variants/export_admin_options.py

uv run --with pillow python \
  design/icon-concepts/2026-09-03-material-variants/make_admin_options_sheet.py
```
