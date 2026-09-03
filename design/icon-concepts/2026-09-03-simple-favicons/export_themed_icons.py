"""Export a supplied favicon mark in the Snakes and Rats palette."""

from __future__ import annotations

import argparse
import colorsys
from pathlib import Path

from PIL import Image, ImageDraw


RESAMPLE = Image.Resampling.LANCZOS
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PUBLIC = REPO / "frontend" / "public"
MARKS = {
    "rat": (HERE / "rat-original.png", ("#e4d8c7", "#f8f2e8")),
    "snake": (HERE / "snake-original.png", ("#c45432", "#e49175")),
}
FOREST = "#1e3a2f"


def rgb(hex_color: str) -> tuple[int, int, int]:
    return tuple(bytes.fromhex(hex_color.removeprefix("#")))


def mix(
    a: tuple[int, int, int],
    b: tuple[int, int, int],
    amount: float,
) -> tuple[int, int, int]:
    return tuple(round(start + (end - start) * amount) for start, end in zip(a, b))


def recolor(source: Image.Image, foreground: tuple[str, str]) -> Image.Image:
    """Preserve geometry and lighting while replacing the source color system."""

    image = source.convert("RGBA")
    pixels = image.load()
    background = rgb(FOREST)
    fg_dark, fg_light = map(rgb, foreground)

    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            _, _, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)

            # The originals use a bright mark on a dark field. Brightness gives
            # us a soft edge mask that retains their antialiasing exactly while
            # ignoring subtle color variation in the dark background.
            mark = min(1.0, max(0.0, (value - 0.24) / 0.38))
            foreground_light = min(1.0, max(0.0, (value - 0.62) / 0.38))
            themed_fg = mix(fg_dark, fg_light, foreground_light)
            pixels[x, y] = (*mix(background, themed_fg, mark), alpha)

    # The supplied files bake black pixels into the rounded corners. Replace
    # those with real transparency so browsers and launchers can provide their
    # own surrounding surface without a visible black fringe.
    corner_mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(corner_mask).rounded_rectangle(
        (0, 0, image.width - 1, image.height - 1),
        radius=round(image.width * 0.16),
        fill=255,
    )
    image.putalpha(corner_mask)

    return image


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mark", choices=MARKS, default="rat")
    args = parser.parse_args()

    source, foreground = MARKS[args.mark]
    themed = recolor(Image.open(source), foreground)
    for size in (16, 32, 48):
        themed.resize((size, size), RESAMPLE).save(
            PUBLIC / f"favicon-{size}x{size}.png",
            optimize=True,
        )
    themed.save(
        PUBLIC / "favicon.ico",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )


if __name__ == "__main__":
    main()
