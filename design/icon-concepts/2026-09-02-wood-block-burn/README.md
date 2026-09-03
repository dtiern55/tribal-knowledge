# Wood-block burn texture study

Texture exploration for the production rat, snake, and flame mark. The selected
solid-background revision supplies the installed app icons; the finer-grained
dark and light revisions supply the sliding-puzzle loader. Browser favicons use
a separate simple animal mark with no wood-burn artwork.

The production icon's composition and silhouettes are held fixed. Only the
surface treatment changes, with the cream rat, terracotta snake, and gold flame
rendered as stained pyrography with restrained charred edges.

Generated with the built-in image-generation edit flow using
`frontend/public/icon-512.webp` as the edit target.

Production exports are generated deterministically from the versioned sources
in this directory:

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

## Fine-grain light loader revision

`wood-block-burn-v5-fine-light.png` supplies the locked-theme loader tiles with
fine, low-contrast wood fibers. The dark loader uses the later readable-walnut
revision below, while the earlier dark source stays in place for the installed
app icon.

The edit used the pale fine-grain reference and the matching light artwork
target:

> Change only the wood surface texture so every wooden region uses a much
> finer, tighter, lower-contrast grain like the supplied material reference.
> Remove the existing coarse, embossed, pebbled grain. Preserve the exact
> square crop, padding, rat, snake, three-part flame, positions, proportions,
> negative spaces, eye shapes, internal cutouts, colors, burned outlines, and
> complete silhouette. Keep the pyrography edge treatment while making only
> the interior surface grain finer and subtler. No geometry changes, redraw,
> seams, tiles, new objects, text, watermark, pencil lines, exaggerated grain,
> or glossy finish.

## Readable dark loader revision

`wood-block-burn-v6-readable-dark.png` lifts the dark loader field from near-
black espresso to a warmer dark walnut so the emblem remains legible at the
loader's rendered size. It supersedes v4 for the loader only; the installed app
icon remains unchanged.

> Make one restrained tonal correction only: lighten the existing dark brown
> wood field/background about 12–15%, from near-black espresso to readable dark
> walnut. Preserve the exact existing fine, subtle, low-contrast vertical wood
> grain, canvas, composition, silhouette, geometry, burned outlines, colors,
> shadows, and lighting. Do not redraw, enlarge, emboss, sharpen, or make the
> grain more visible. No cropping, shape changes, new details, text, or
> watermark.

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
