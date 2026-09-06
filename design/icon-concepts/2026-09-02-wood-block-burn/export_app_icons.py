"""Export the approved app icon and loading-puzzle marks."""

import argparse
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
SELECTED = HERE.parent / "2026-09-03-material-variants"
ENAMEL = HERE.parent / "2026-09-05-modern-enamel"
SOURCE_APP = ENAMEL / "modern-enamel-approved.png"
# The approved art shrunk into Android's maskable safe zone.
SOURCE_MASKABLE = ENAMEL / "modern-enamel-maskable-source.png"
PUZZLE_UNLOCKED = SELECTED / "selected-walnut-light.png"
PUZZLE_LIGHT = HERE / "wood-block-burn-v5-fine-light.png"
PUBLIC = REPO / "frontend" / "public"
RESAMPLE = Image.Resampling.LANCZOS


def resized(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), RESAMPLE)


def save_webp(image: Image.Image, name: str) -> None:
    image.save(PUBLIC / name, "WEBP", quality=92, method=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--app-only",
        action="store_true",
        help="Export app icons without rewriting slide-puzzle art.",
    )
    args = parser.parse_args()

    app = Image.open(SOURCE_APP).convert("RGB")
    maskable = Image.open(SOURCE_MASKABLE).convert("RGB")
    puzzle_sources = (
        []
        if args.app_only
        else [
            Image.open(PUZZLE_UNLOCKED).convert("RGB"),
            Image.open(PUZZLE_LIGHT).convert("RGB"),
        ]
    )
    for source in [app, maskable, *puzzle_sources]:
        if source.width != source.height:
            raise ValueError(f"Expected a square source, got {source.size}")

    save_webp(resized(app, 512), "icon-512.webp")
    save_webp(resized(app, 192), "icon-192.webp")
    save_webp(resized(maskable, 512), "icon-512-maskable.webp")
    resized(app, 180).save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)

    if puzzle_sources:
        puzzle_unlocked, puzzle_light = puzzle_sources
        save_webp(resized(puzzle_unlocked, 640), "puzzle-wood-solid.webp")
        save_webp(resized(puzzle_light, 640), "puzzle-wood-light.webp")


if __name__ == "__main__":
    main()
