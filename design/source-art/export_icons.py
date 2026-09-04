"""Regenerate every icon and loading-puzzle image under frontend/public from the sources here."""

import argparse
import colorsys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[1] / "frontend" / "public"
RESAMPLE = Image.Resampling.LANCZOS
FOREST = (0x1E, 0x3A, 0x2F)
FAVICON_FG = ((0xE4, 0xD8, 0xC7), (0xF8, 0xF2, 0xE8))  # cream, dark to light


def resized(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), RESAMPLE)


def save_webp(image: Image.Image, name: str) -> None:
    image.save(PUBLIC / name, "WEBP", quality=92, method=6)


def maskable_icon(source: Image.Image) -> Image.Image:
    """Keep the whole warm mark inside Android's central maskable safe zone."""
    # Extend the source's forest canvas around a smaller copy of the mark. The
    # low-contrast field keeps launcher masks from exposing a framed square.
    texture = source.crop((0, 0, 256, 256)).resize((512, 512), RESAMPLE)
    background = Image.blend(Image.new("RGB", (512, 512), "#103c2b"), texture, 0.42)
    background = background.filter(ImageFilter.GaussianBlur(0.55))

    inset_size = 384
    inset = resized(source, inset_size)
    alpha = Image.new("L", (inset_size, inset_size), 0)
    source_pixels = inset.load()
    alpha_pixels = alpha.load()
    for y in range(inset_size):
        for x in range(inset_size):
            red, green, _ = source_pixels[x, y]
            # Cream, gold, and terracotta are all warmer than the green canvas.
            warmth = min(1.0, max(0.0, (red - green + 4) / 28))
            alpha_pixels[x, y] = round(255 * warmth)
    # Grow the mask slightly to retain the dry-brush edges.
    alpha = alpha.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(0.65))
    background.paste(inset, ((512 - inset_size) // 2,) * 2, alpha)
    return background


def mix(a: tuple[int, int, int], b: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(start + (end - start) * amount) for start, end in zip(a, b))


def themed_favicon(source: Image.Image) -> Image.Image:
    """Recolor the supplied bright-on-dark rat into cream on forest, keeping its antialiasing."""
    image = source.convert("RGBA")
    pixels = image.load()
    fg_dark, fg_light = FAVICON_FG
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            _, _, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            # Brightness is the edge mask; it ignores color noise in the dark field.
            mark = min(1.0, max(0.0, (value - 0.24) / 0.38))
            highlight = min(1.0, max(0.0, (value - 0.62) / 0.38))
            pixels[x, y] = (*mix(FOREST, mix(fg_dark, fg_light, highlight), mark), alpha)
    # The source bakes black into its rounded corners; make them transparent.
    corner_mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(corner_mask).rounded_rectangle(
        (0, 0, image.width - 1, image.height - 1), radius=round(image.width * 0.16), fill=255
    )
    image.putalpha(corner_mask)
    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-only", action="store_true", help="Skip the slide-puzzle and favicon exports.")
    args = parser.parse_args()

    app = Image.open(HERE / "app-icon.png").convert("RGB")
    save_webp(resized(app, 512), "icon-512.webp")
    save_webp(resized(app, 192), "icon-192.webp")
    save_webp(maskable_icon(app), "icon-512-maskable.webp")
    resized(app, 180).save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)
    if args.app_only:
        return

    unlocked = Image.open(HERE / "puzzle-unlocked-walnut.png").convert("RGB")
    locked = Image.open(HERE / "puzzle-locked-fine-light.png").convert("RGB")
    save_webp(resized(unlocked, 640), "puzzle-wood-solid.webp")
    save_webp(resized(locked, 640), "puzzle-wood-light.webp")

    favicon = themed_favicon(Image.open(HERE / "favicon-rat.png"))
    for size in (16, 32):
        resized(favicon, size).save(PUBLIC / f"favicon-{size}x{size}.png", optimize=True)
    favicon.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == "__main__":
    main()
