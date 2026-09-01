#!/usr/bin/env python3
"""Export the Snakes and Rats source art for the app and loader."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps


HERE = Path(__file__).resolve().parent
DEFAULT_SOURCE = HERE / "snakes-and-rats-final-v2.png"
DEFAULT_LIGHT_SOURCE = HERE / "snakes-and-rats-final-v2-light.png"
DEFAULT_OUTPUT = HERE.parent.parent / "frontend" / "public"


def resize(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), Image.Resampling.LANCZOS)


def woven_background(source: Image.Image, size: int) -> Image.Image:
    """Build a full forest canvas from an object-free corner of the source."""
    patch_size = source.width // 5
    patch = source.crop((0, 0, patch_size, patch_size))
    return resize(patch, size)


def maskable(source: Image.Image) -> Image.Image:
    canvas = woven_background(source, 512)
    inset_size = 400
    inset = resize(source, inset_size)

    # Feather only the source square's edge. The animals remain crisp while the
    # two copies of the forest weave blend without a visible inset boundary.
    matte = Image.new("L", (inset_size, inset_size), 255)
    edge = 28
    draw = ImageDraw.Draw(matte)
    for i in range(edge):
        opacity = round(255 * (i + 1) / edge)
        draw.rectangle((i, i, inset_size - i - 1, inset_size - i - 1), outline=opacity)
    matte = matte.filter(ImageFilter.GaussianBlur(1.25))
    offset = ((512 - inset_size) // 2,) * 2
    canvas.paste(inset, offset, matte)
    return canvas


def export(source_path: Path, light_source_path: Path, output_dir: Path) -> None:
    source = Image.open(source_path).convert("RGB")
    light_source = Image.open(light_source_path).convert("RGB")
    output_dir.mkdir(parents=True, exist_ok=True)

    resize(source, 512).save(output_dir / "icon-512.webp", "WEBP", quality=95, method=6)
    resize(source, 192).save(output_dir / "icon-192.webp", "WEBP", quality=95, method=6)
    maskable(source).save(output_dir / "icon-512-maskable.webp", "WEBP", quality=95, method=6)
    resize(source, 180).save(output_dir / "apple-touch-icon.png", "PNG", optimize=True)
    resize(source, 48).save(
        output_dir / "favicon.ico",
        "ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    resize(source, 640).save(output_dir / "puzzle-flat-dark.webp", "WEBP", quality=95, method=6)
    resize(light_source, 640).save(output_dir / "puzzle-flat-light.webp", "WEBP", quality=95, method=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--light-source", type=Path, default=DEFAULT_LIGHT_SOURCE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    export(args.source, args.light_source, args.output_dir)


if __name__ == "__main__":
    main()
