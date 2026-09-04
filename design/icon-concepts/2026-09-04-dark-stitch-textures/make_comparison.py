"""Build the small-size comparison for the dark stitch texture study."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
SOURCE = (
    HERE.parent
    / "2026-09-04-brighter-foreground"
    / "patchwork-unlocked-bright-burnt-red.png"
)
ROWS = [
    ("DENSE PATCHWORK · CONTROL", SOURCE),
    ("CLEAN WOVEN · BURNT RED", HERE / "dark-patchwork-clean-woven.png"),
    (
        "CLEAN WOVEN · BURNT ORANGE · SELECTED",
        HERE / "dark-patchwork-clean-woven-burnt-orange.png",
    ),
    ("STITCHED APPLIQUE", HERE / "dark-patchwork-stitched-applique.png"),
]
SIZES = [48, 64, 128, 256]
OUTPUT = HERE / "dark-stitch-texture-comparison.png"
RESAMPLE = Image.Resampling.LANCZOS


def main() -> None:
    margin = 28
    label_height = 32
    gap = 28
    row_height = 256 + label_height + 28
    width = margin * 2 + sum(SIZES) + gap * (len(SIZES) - 1)
    height = margin * 2 + row_height * len(ROWS)
    sheet = Image.new("RGB", (width, height), "#e9e1d2")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=16)

    for row, (label, path) in enumerate(ROWS):
        source = Image.open(path).convert("RGB")
        y = margin + row * row_height
        draw.text((margin, y), label, fill="#103c2b", font=font)
        x = margin
        for size in SIZES:
            thumb = source.resize((size, size), RESAMPLE)
            icon_y = y + label_height + (256 - size)
            sheet.paste(thumb, (x, icon_y))
            draw.text((x, y + label_height + 262), f"{size}px", fill="#315847", font=font)
            x += size + gap

    sheet.save(OUTPUT, "PNG", optimize=True)


if __name__ == "__main__":
    main()
