"""Export the approved app icon and loading-puzzle marks."""

import argparse

from pathlib import Path

from PIL import Image, ImageFilter


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
SELECTED = HERE.parent / "2026-09-03-material-variants"
SOURCE_APP = (
    HERE.parent
    / "2026-09-04-dark-stitch-textures"
    / "dark-patchwork-clean-woven-burnt-orange.png"
)
PUZZLE_UNLOCKED = SELECTED / "selected-walnut-light.png"
PUZZLE_LIGHT = HERE / "wood-block-burn-v5-fine-light.png"
PUBLIC = REPO / "frontend" / "public"
RESAMPLE = Image.Resampling.LANCZOS


def resized(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), RESAMPLE)


def save_webp(image: Image.Image, name: str) -> None:
    image.save(PUBLIC / name, "WEBP", quality=92, method=6)


def maskable_icon(source: Image.Image) -> Image.Image:
    """Keep the whole warm mark inside Android's central maskable safe zone."""

    # Extend the source's forest canvas around a smaller copy of the mark. The
    # low-contrast field keeps launcher masks from exposing a framed square.
    texture = source.crop((0, 0, 256, 256)).resize((512, 512), RESAMPLE)
    forest = Image.new("RGB", (512, 512), "#103c2b")
    background = Image.blend(forest, texture, 0.42)
    background = background.filter(ImageFilter.GaussianBlur(0.55))

    inset_size = 384
    inset = resized(source, inset_size)
    alpha = Image.new("L", (inset_size, inset_size), 0)
    source_pixels = inset.load()
    alpha_pixels = alpha.load()
    for y in range(inset_size):
        for x in range(inset_size):
            red, green, blue = source_pixels[x, y]
            # Cream, gold, and terracotta are all warmer than the green canvas.
            # Grow the resulting mask slightly to retain their dry-brush edges.
            warmth = min(1.0, max(0.0, (red - green + 4) / 28))
            alpha_pixels[x, y] = round(255 * warmth)

    alpha = alpha.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(0.65))

    background.paste(inset, ((512 - inset_size) // 2,) * 2, alpha)
    return background


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--app-only",
        action="store_true",
        help="Export app icons without rewriting slide-puzzle art.",
    )
    args = parser.parse_args()

    app = Image.open(SOURCE_APP).convert("RGB")
    puzzle_sources = [] if args.app_only else [
        Image.open(PUZZLE_UNLOCKED).convert("RGB"),
        Image.open(PUZZLE_LIGHT).convert("RGB"),
    ]
    for source in [app, *puzzle_sources]:
        if source.width != source.height:
            raise ValueError(f"Expected a square source, got {source.size}")

    save_webp(resized(app, 512), "icon-512.webp")
    save_webp(resized(app, 192), "icon-192.webp")
    save_webp(maskable_icon(app), "icon-512-maskable.webp")
    resized(app, 180).save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)

    if puzzle_sources:
        puzzle_unlocked, puzzle_light = puzzle_sources
        save_webp(resized(puzzle_unlocked, 640), "puzzle-wood-solid.webp")
        save_webp(resized(puzzle_light, 640), "puzzle-wood-light.webp")


if __name__ == "__main__":
    main()
