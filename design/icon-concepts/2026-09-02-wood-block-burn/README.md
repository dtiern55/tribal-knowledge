# Wood-block burn texture study

Texture exploration for the production rat, snake, and flame mark. The selected
solid-background revision supplies the installed app icons and the
sliding-puzzle loader.

The production icon's composition and silhouettes are held fixed. Only the
surface treatment changes, with the cream rat, terracotta snake, and gold flame
rendered as stained pyrography with restrained charred edges.

Generated with the built-in image-generation edit flow using
`frontend/public/icon-512.webp` as the edit target.

Production exports are generated deterministically from
`wood-block-burn-v2-solid-background.png`:

```bash
uv run --with pillow python \
  design/icon-concepts/2026-09-02-wood-block-burn/export_app_icons.py
```

## Solid-background revision

`wood-block-burn-v2-solid-background.png` replaces the fitted-block field with
one uninterrupted dark-walnut surface. The emblem and burned-color treatment
remain unchanged.

> Change only the brown wooden background. Remove every tile, block, brick,
> panel, grout, seam, and rectangular division. Replace it with one continuous,
> solid dark-walnut wooden surface spanning the entire square, with restrained
> natural grain and very subtle tonal variation. It should read first as a
> calm, unified solid field rather than a pattern. Preserve the rat, snake, and
> three-part flame exactly, including every color, burned outline, texture,
> position, proportion, negative space, internal cutout, and silhouette.

## Light loader revision

`wood-block-burn-v3-light-background.png` is the locked-theme companion. It
keeps the snake, flame, geometry, and pyrography treatment unchanged while
swapping the other two tonal roles: one continuous pale maple background and a
smoked-walnut rat.

> Change only the background wood tone and rat wood tone. Replace the
> continuous dark-walnut background with one uninterrupted pale warm maple or
> beech surface, and change the rat from pale wood to deep smoked walnut. Keep
> the rat visibly wood-grained and burned into the surface. Preserve the exact
> crop, padding, positions, proportions, negative spaces, internal cutouts,
> burned outlines, and silhouettes. Keep the snake terracotta and the flame
> amber gold. No seams, tiles, panels, new objects, text, glow, or watermark.

## Prompt

> Change only the material and surface texture. Reinterpret the entire icon as
> a square field assembled from warm, handcrafted wooden blocks with subtle
> seams and varied natural grain. Render the rat, snake, and three-part flame
> as refined pyrography, lightly stained in their existing cream, terracotta,
> and gold colors, with restrained dark charring at the engraved edges. Keep
> the exact crop, padding, positions, proportions, pose, facing direction,
> negative spaces, internal cutouts, and contours of the production icon. Do
> not redraw, reshape, simplify, thicken, thin, move, rotate, resize, add to, or
> remove from any silhouette. No new objects, text, border, badge, glow,
> decorative carvings, or watermark.
