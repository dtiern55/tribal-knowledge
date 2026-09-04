"""Sample representative midtones from the selected textured icon regions."""

import colorsys
import statistics
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "dark-patchwork-clean-woven-burnt-orange.png"

# Crops keep similarly warm colors in neighboring shapes out of each sample.
REGIONS = {
    "rat": ((160, 200, 660, 1170), lambda h, s, v: 0.08 <= h <= 0.18 and s < 0.55 and v > 0.45),
    "flame": ((500, 420, 820, 1080), lambda h, s, v: 0.09 <= h <= 0.18 and s > 0.48 and v > 0.45),
    "snake": ((650, 90, 1110, 1090), lambda h, s, v: 0.02 <= h < 0.09 and s > 0.50 and v > 0.35),
}


def hex_color(rgb: tuple[int, int, int]) -> str:
    return "#" + "".join(f"{channel:02x}" for channel in rgb)


def main() -> None:
    image = Image.open(SOURCE).convert("RGB")
    for name, (box, accepts) in REGIONS.items():
        pixels = []
        for red, green, blue in image.crop(box).get_flattened_data():
            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            if accepts(hue, saturation, value):
                pixels.append((red, green, blue))
        median = tuple(round(statistics.median(channel)) for channel in zip(*pixels))
        pixels.sort(key=lambda color: 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2])
        center = round(len(pixels) * 0.90)
        upper_midtone_pixels = pixels[max(0, center - 500) : center + 500]
        upper_midtone = tuple(
            round(statistics.median(channel)) for channel in zip(*upper_midtone_pixels)
        )
        print(
            f"{name}: median {hex_color(median)}, "
            f"bright midtone {hex_color(upper_midtone)} ({len(pixels):,} sampled pixels)"
        )


if __name__ == "__main__":
    main()
