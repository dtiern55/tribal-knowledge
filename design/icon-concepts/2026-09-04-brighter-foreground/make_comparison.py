"""Build a launcher-size comparison for the brighter-foreground icon study."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
CURRENT = HERE.parent / "2026-09-03-material-variants" / "selected-canvas-heavy-dark.png"
CANDIDATE = HERE / "bright-foreground-v1.png"
BALANCED = HERE / "bright-foreground-v2-balanced.png"
OUTPUT = HERE / "bright-foreground-comparison.png"
RESAMPLE = Image.Resampling.LANCZOS


def main() -> None:
    sources = [
        ("CURRENT", Image.open(CURRENT).convert("RGB")),
        ("BALANCED LIFT", Image.open(BALANCED).convert("RGB")),
        ("VIVID LIFT", Image.open(CANDIDATE).convert("RGB")),
    ]
    sizes = [48, 64, 128, 256]
    margin = 28
    label_height = 32
    gap = 28
    row_height = 256 + label_height + 26
    width = margin * 2 + sum(sizes) + gap * (len(sizes) - 1)
    height = margin * 2 + row_height * len(sources)
    sheet = Image.new("RGB", (width, height), "#e9e1d2")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=16)

    for row, (label, source) in enumerate(sources):
        y = margin + row * row_height
        draw.text((margin, y), label, fill="#103c2b", font=font)
        x = margin
        for size in sizes:
            thumb = source.resize((size, size), RESAMPLE)
            icon_y = y + label_height + (256 - size)
            sheet.paste(thumb, (x, icon_y))
            draw.text((x, y + label_height + 262), f"{size}px", fill="#315847", font=font)
            x += size + gap

    sheet.save(OUTPUT, "PNG", optimize=True)


if __name__ == "__main__":
    main()
