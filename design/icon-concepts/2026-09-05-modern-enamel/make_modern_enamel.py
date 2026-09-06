"""Render the modern-enamel app icon from the frozen rat, flame, and snake masks.

The geometry lives in ``masks/*.png``: binary masks segmented once from the
approved heavy-canvas artwork (``--freeze-masks``) and committed, so a surface
treatment can only recolour the mark, never reshape it.  The default run reads
those masks and paints the gradients; it refuses to run without them.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

HERE = Path(__file__).resolve().parent
SOURCE = (
    HERE.parent
    / "2026-09-04-brighter-foreground"
    / "canvas-vivid-burnt-red-flatter-background.png"
)
MASKS = HERE / "masks"
MASK_NAMES = ("rat", "flame", "snake")
OUTPUT = HERE / "modern-enamel-source.png"
MASKABLE_OUTPUT = HERE / "modern-enamel-maskable-source.png"
COMPARISON = HERE / "modern-enamel-comparison.png"
RESAMPLE = Image.Resampling.LANCZOS
# Android's maskable safe zone is the central 80% circle; 75% keeps the tail
# and snake crown inside it with a little margin.
MASKABLE_INSET = 0.75


def keep_components(mask: np.ndarray, minimum: int) -> np.ndarray:
    labels, count = ndimage.label(mask)
    if not count:
        return mask
    sizes = np.bincount(labels.ravel())
    accepted = sizes >= minimum
    accepted[0] = False
    return accepted[labels]


def largest_component(mask: np.ndarray) -> np.ndarray:
    labels, count = ndimage.label(mask)
    if not count:
        return mask
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return labels == int(np.argmax(sizes))


def component_at(mask: np.ndarray, row: int, column: int) -> np.ndarray:
    labels, _ = ndimage.label(mask)
    label = int(labels[row, column])
    return labels == label if label else np.zeros_like(mask)


def clean(mask: np.ndarray, minimum: int) -> np.ndarray:
    # Close only paint-pinholes; the intentional eyes and open negative spaces
    # are much larger and remain untouched.
    structure = ndimage.generate_binary_structure(2, 1)
    mask = ndimage.binary_closing(mask, structure=structure, iterations=2)
    return keep_components(mask, minimum)


def keep_only_largest_enclosed_hole(mask: np.ndarray) -> np.ndarray:
    """Fill texture holes while preserving the single intentional eye."""
    inverse_labels, count = ndimage.label(~mask)
    if not count:
        return mask
    border_labels = np.unique(
        np.concatenate(
            [
                inverse_labels[0],
                inverse_labels[-1],
                inverse_labels[:, 0],
                inverse_labels[:, -1],
            ]
        )
    )
    sizes = np.bincount(inverse_labels.ravel())
    enclosed = [index for index in range(1, count + 1) if index not in border_labels]
    if not enclosed:
        return mask
    eye = max(enclosed, key=lambda index: sizes[index])
    fill = np.isin(inverse_labels, [index for index in enclosed if index != eye])
    return mask | fill


def soft_mask(mask: Image.Image, inset: float) -> Image.Image:
    """Optionally shrink a frozen mask toward the centre, then soften its edge."""
    if inset != 1.0:
        size = round(mask.width * inset)
        shrunk = mask.resize((size, size), RESAMPLE)
        mask = Image.new("L", mask.size, 0)
        mask.paste(shrunk, ((mask.width - size) // 2,) * 2)
    return mask.filter(ImageFilter.GaussianBlur(0.45))


def gradient(
    size: tuple[int, int], top: str, bottom: str, glow: str | None = None
) -> Image.Image:
    width, height = size
    top_rgb = np.array(Image.new("RGB", (1, 1), top).getpixel((0, 0)), dtype=np.float32)
    bottom_rgb = np.array(
        Image.new("RGB", (1, 1), bottom).getpixel((0, 0)), dtype=np.float32
    )
    y = np.linspace(0, 1, height, dtype=np.float32)[:, None, None]
    rgb = top_rgb[None, None, :] * (1 - y) + bottom_rgb[None, None, :] * y
    rgb = np.repeat(rgb, width, axis=1)

    if glow:
        glow_rgb = np.array(
            Image.new("RGB", (1, 1), glow).getpixel((0, 0)), dtype=np.float32
        )
        yy, xx = np.mgrid[0:height, 0:width]
        radius = np.sqrt(
            ((xx / width - 0.43) / 0.72) ** 2 + ((yy / height - 0.38) / 0.72) ** 2
        )
        amount = np.clip(1 - radius, 0, 1)[..., None] * 0.28
        rgb = rgb * (1 - amount) + glow_rgb[None, None, :] * amount

    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def paste_with_depth(canvas: Image.Image, fill: Image.Image, mask: Image.Image) -> None:
    # A very soft grounding shadow gives launcher-size separation without
    # introducing a bevel or changing the silhouette.
    shadow_alpha = mask.filter(ImageFilter.GaussianBlur(7))
    shadow_alpha = shadow_alpha.point(lambda value: round(value * 0.24))
    shifted = Image.new("L", canvas.size, 0)
    shifted.paste(shadow_alpha, (0, 4))
    shadow = Image.new("RGB", canvas.size, "#001c14")
    canvas.paste(shadow, (0, 0), shifted)
    canvas.paste(fill, (0, 0), mask)


def freeze_masks() -> None:
    """Segment the approved artwork once and write the binary masks."""
    source = Image.open(SOURCE).convert("RGB")
    # Classify a low-frequency copy: broad forms survive while brush ridges,
    # canvas grooves, and isolated dark pinholes average away.  The source is
    # still the sole geometry input.
    segmentation_source = source.filter(ImageFilter.GaussianBlur(8))
    pixels = np.asarray(segmentation_source).astype(np.float32) / 255.0
    red, green, blue = pixels[..., 0], pixels[..., 1], pixels[..., 2]
    raw_pixels = np.asarray(source).astype(np.float32) / 255.0
    raw_red, raw_green, raw_blue = (
        raw_pixels[..., 0],
        raw_pixels[..., 1],
        raw_pixels[..., 2],
    )
    height, width = red.shape
    yy, xx = np.mgrid[0:height, 0:width]
    xn, yn = xx / width, yy / height

    # Colour + position separate the three existing foreground regions from
    # the green field. These are masks, not newly drawn geometry.
    rat = (
        (xn < 0.59)
        & (yn > 0.13)
        & (red > 0.32)
        & (green > 0.23)
        & (red > green * 0.96)
        & (green > blue * 1.18)
        & ((red - green) < 0.28)
        & ((red + green) > 0.88)
    )
    flame = (
        (xn > 0.39)
        & (xn < 0.68)
        & (yn > 0.31)
        & (yn < 0.88)
        & (red > 0.42)
        & (green > 0.24)
        & (red > green * 1.04)
        & (green > blue * 1.55)
        & ((green / np.maximum(red, 0.01)) > 0.38)
    )
    snake = (
        (xn > 0.50)
        & (yn > 0.05)
        & (yn < 0.90)
        & (red > 0.30)
        & (red > green * 1.55)
        & (red > blue * 1.65)
        & ((green / np.maximum(red, 0.01)) < 0.48)
    )

    # The forked tongue is intentionally fine enough that the broad blur can
    # merge its two tips. Restore just this local detail from the source pixels.
    tongue = (
        (xn > 0.545)
        & (xn < 0.60)
        & (yn > 0.24)
        & (yn < 0.37)
        & (raw_red > 0.32)
        & (raw_red > raw_green * 1.42)
        & (raw_red > raw_blue * 1.55)
    )
    tongue = clean(tongue, minimum=5)

    rat_eye_candidates = (
        (xn > 0.43)
        & (xn < 0.49)
        & (yn > 0.22)
        & (yn < 0.29)
        & (raw_green > raw_red * 1.18)
        & (raw_green > raw_blue * 1.18)
    )
    snake_eye_candidates = (
        (xn > 0.54)
        & (xn < 0.61)
        & (yn > 0.14)
        & (yn < 0.23)
        & (raw_green > raw_red * 1.18)
        & (raw_green > raw_blue * 1.18)
    )
    rat_eye = component_at(
        rat_eye_candidates, round(height * 0.261), round(width * 0.457)
    )
    snake_eye = component_at(
        snake_eye_candidates, round(height * 0.179), round(width * 0.583)
    )

    rat = clean(rat, minimum=900)
    flame = clean(flame, minimum=350)
    snake = clean(snake, minimum=140) | tongue
    rat = keep_only_largest_enclosed_hole(rat)
    snake = keep_only_largest_enclosed_hole(snake)
    rat &= ~rat_eye
    snake &= ~snake_eye

    # Resolve the handful of antialiased overlap pixels in the same visual
    # order as the current artwork.
    flame &= ~snake
    rat &= ~(flame | snake)

    MASKS.mkdir(exist_ok=True)
    for name, mask in zip(MASK_NAMES, (rat, flame, snake)):
        Image.fromarray((mask * 255).astype(np.uint8), "L").save(
            MASKS / f"{name}.png", optimize=True
        )


def build_icon(inset: float = 1.0) -> Image.Image:
    masks = {}
    for name in MASK_NAMES:
        path = MASKS / f"{name}.png"
        if not path.exists():
            raise SystemExit(
                f"Missing frozen mask {path}; run with --freeze-masks first."
            )
        masks[name] = soft_mask(Image.open(path).convert("L"), inset)
    size = masks["rat"].size

    canvas = gradient(size, "#0b5439", "#032c22", glow="#11724a")
    paste_with_depth(
        canvas, gradient(size, "#fff5d2", "#e9bd69", glow="#fffbea"), masks["rat"]
    )
    paste_with_depth(
        canvas, gradient(size, "#ffe163", "#f39a08", glow="#fff09a"), masks["flame"]
    )
    paste_with_depth(
        canvas, gradient(size, "#f15b3b", "#bc2927", glow="#ff7551"), masks["snake"]
    )
    return canvas


def make_comparison(modern: Image.Image) -> None:
    current = Image.open(SOURCE).convert("RGB")
    sheet = Image.new("RGB", (1120, 720), "#ebe5da")
    draw = ImageDraw.Draw(sheet)
    title_font = ImageFont.load_default(size=24)
    label_font = ImageFont.load_default(size=16)
    draw.text(
        (36, 26),
        "SNAKES AND RATS · MODERN SURFACE STUDY",
        fill="#133b2d",
        font=title_font,
    )

    draw.text((36, 78), "CURRENT · HEAVY CANVAS", fill="#315847", font=label_font)
    draw.text((574, 78), "PROPOSED · MODERN ENAMEL", fill="#315847", font=label_font)
    sheet.paste(current.resize((480, 480), RESAMPLE), (36, 108))
    sheet.paste(modern.resize((480, 480), RESAMPLE), (574, 108))

    draw.text((36, 620), "LAUNCHER SIZE", fill="#315847", font=label_font)
    x = 190
    for size in (48, 64, 96):
        sheet.paste(current.resize((size, size), RESAMPLE), (x, 610 + 96 - size))
        x += size + 18
        sheet.paste(modern.resize((size, size), RESAMPLE), (x, 610 + 96 - size))
        x += size + 40

    sheet.save(COMPARISON, "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--freeze-masks",
        action="store_true",
        help="Re-segment the source artwork and overwrite masks/. Changes the approved geometry.",
    )
    if parser.parse_args().freeze_masks:
        freeze_masks()
    modern = build_icon()
    modern.save(OUTPUT, "PNG", optimize=True)
    build_icon(MASKABLE_INSET).save(MASKABLE_OUTPUT, "PNG", optimize=True)
    make_comparison(modern)


if __name__ == "__main__":
    main()
