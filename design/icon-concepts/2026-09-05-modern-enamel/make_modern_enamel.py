"""Freeze the approved modern-enamel artwork's masks and build its maskable variant.

``modern-enamel-approved.png`` is the selected artwork and the app-icon source
as-is.  ``--freeze-masks`` segments its rat, flame, and snake once into
``masks/*.png`` so the approved geometry is pinned down for any later surface
work.  The default run builds the maskable source (the approved art shrunk into
Android's safe zone over its own reconstructed background) and the comparison
board; it refuses to run without the frozen masks.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

HERE = Path(__file__).resolve().parent
PREVIOUS = (
    HERE.parent
    / "2026-09-04-brighter-foreground"
    / "canvas-vivid-burnt-red-flatter-background.png"
)
APPROVED = HERE / "modern-enamel-approved.png"
MASKS = HERE / "masks"
MASK_NAMES = ("rat", "flame", "snake")
MASKABLE_OUTPUT = HERE / "modern-enamel-maskable-source.png"
COMPARISON = HERE / "modern-enamel-comparison.png"
RESAMPLE = Image.Resampling.LANCZOS
# Android's maskable safe zone is the central 80% circle; 75% keeps the tail
# and snake crown inside it with a little margin.
MASKABLE_INSET = 0.75


def foreground_alpha(pixels: np.ndarray) -> np.ndarray:
    """Soft coverage of the warm forms over the green field, 0..1."""
    warmth = pixels[..., 0] - pixels[..., 1]
    # Background sits around -50, the palest ivory highlight around +10.
    return np.clip((warmth + 30) / 40, 0, 1)


def largest_component(mask: np.ndarray) -> np.ndarray:
    labels, count = ndimage.label(mask)
    if not count:
        return mask
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    return labels == int(np.argmax(sizes))


def freeze_masks() -> None:
    """Split the approved artwork into rat, flame, and snake by hue."""
    pixels = np.asarray(Image.open(APPROVED).convert("RGB")).astype(np.float32)
    alpha = foreground_alpha(pixels)
    solid = alpha > 0.5
    green = pixels[..., 1] / np.maximum(pixels[..., 0], 1)
    blue = pixels[..., 2] / np.maximum(pixels[..., 0], 1)
    # Ivory keeps far more blue than the gold, and the red-orange snake keeps
    # under half its green.
    rat = largest_component(solid & (blue > 0.4))
    snake = largest_component(solid & ~rat & (green < 0.42))
    flame = largest_component(solid & ~rat & ~snake)
    MASKS.mkdir(exist_ok=True)
    for name, region in zip(MASK_NAMES, (rat, flame, snake)):
        # Keep the antialiased edge from the artwork, restricted to this form.
        grown = ndimage.binary_dilation(region, iterations=2)
        soft = np.where(grown, alpha, 0.0)
        Image.fromarray((soft * 255).round().astype(np.uint8), "L").save(
            MASKS / f"{name}.png", optimize=True
        )


def load_masks() -> dict[str, Image.Image]:
    masks = {}
    for name in MASK_NAMES:
        path = MASKS / f"{name}.png"
        if not path.exists():
            raise SystemExit(
                f"Missing frozen mask {path}; run with --freeze-masks first."
            )
        masks[name] = Image.open(path).convert("L")
    return masks


def reconstruct_background(approved: Image.Image, coverage: Image.Image) -> Image.Image:
    """Fill the forms with the surrounding vignette so an inset can sit on it."""
    pixels = np.asarray(approved).astype(np.float32)
    hole = np.asarray(coverage).astype(np.float32) / 255 > 0.02
    # Widen the hole past the grounding shadow so it does not tint the fill.
    hole = ndimage.binary_dilation(hole, iterations=40)
    keep = (~hole).astype(np.float32)
    # ponytail: normalized blur is a fine inpaint for a smooth radial vignette.
    weight = ndimage.gaussian_filter(keep, 80)
    filled = (
        np.stack(
            [ndimage.gaussian_filter(pixels[..., c] * keep, 80) for c in range(3)],
            axis=-1,
        )
        / np.maximum(weight, 1e-6)[..., None]
    )
    blend = ndimage.gaussian_filter(hole.astype(np.float32), 12)[..., None]
    out = pixels * (1 - blend) + filled * blend
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB")


def build_maskable(approved: Image.Image, masks: dict[str, Image.Image]) -> Image.Image:
    coverage = masks["rat"]
    for name in ("flame", "snake"):
        coverage = Image.fromarray(
            np.maximum(np.asarray(coverage), np.asarray(masks[name])), "L"
        )
    canvas = reconstruct_background(approved, coverage)

    size = round(approved.width * MASKABLE_INSET)
    offset = ((approved.width - size) // 2,) * 2
    inset_alpha = Image.new("L", approved.size, 0)
    inset_alpha.paste(coverage.resize((size, size), RESAMPLE), offset)

    # Re-lay the artwork's soft grounding shadow under the shrunken forms.
    shadow_alpha = inset_alpha.filter(ImageFilter.GaussianBlur(7)).point(
        lambda value: round(value * 0.24)
    )
    shifted = Image.new("L", approved.size, 0)
    shifted.paste(shadow_alpha, (0, 4))
    canvas.paste(Image.new("RGB", approved.size, "#001c14"), (0, 0), shifted)

    inset = Image.new("RGB", approved.size, 0)
    inset.paste(approved.resize((size, size), RESAMPLE), offset)
    canvas.paste(inset, (0, 0), inset_alpha)
    return canvas


def make_comparison(approved: Image.Image) -> None:
    previous = Image.open(PREVIOUS).convert("RGB")
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

    draw.text((36, 78), "PREVIOUS · HEAVY CANVAS", fill="#315847", font=label_font)
    draw.text((574, 78), "APPROVED · MODERN ENAMEL", fill="#315847", font=label_font)
    sheet.paste(previous.resize((480, 480), RESAMPLE), (36, 108))
    sheet.paste(approved.resize((480, 480), RESAMPLE), (574, 108))

    draw.text((36, 620), "LAUNCHER SIZE", fill="#315847", font=label_font)
    x = 190
    for size in (48, 64, 96):
        sheet.paste(previous.resize((size, size), RESAMPLE), (x, 610 + 96 - size))
        x += size + 18
        sheet.paste(approved.resize((size, size), RESAMPLE), (x, 610 + 96 - size))
        x += size + 40

    sheet.save(COMPARISON, "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--freeze-masks",
        action="store_true",
        help="Re-segment the approved artwork and overwrite masks/.",
    )
    if parser.parse_args().freeze_masks:
        freeze_masks()
    approved = Image.open(APPROVED).convert("RGB")
    build_maskable(approved, load_masks()).save(MASKABLE_OUTPUT, "PNG", optimize=True)
    make_comparison(approved)


if __name__ == "__main__":
    main()
