"""Build a small-size comparison for the coordinated burnt-red icon set."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ROWS = [
    (
        "HEAVY CANVAS",
        ROOT / "2026-09-03-material-variants" / "selected-canvas-heavy-dark.png",
        HERE / "canvas-vivid-burnt-red-v2-lighter.png",
    ),
    (
        "PATCHWORK · UNLOCKED",
        ROOT / "snakes-and-rats-final.png",
        HERE / "patchwork-unlocked-bright-burnt-red.png",
    ),
    (
        "PATCHWORK · LOCKED",
        ROOT / "snakes-and-rats-locked.png",
        HERE / "patchwork-locked-bright-burnt-red.png",
    ),
]
OUTPUT = HERE / "burnt-red-set-comparison.png"
RESAMPLE = Image.Resampling.LANCZOS


def main() -> None:
    margin = 32
    label_width = 220
    gap = 32
    row_height = 300
    columns = [("ORIG · 64", 64, False), ("NEW · 64", 64, True),
               ("ORIGINAL · 256", 256, False), ("BRIGHT + RED · 256", 256, True)]
    content_width = sum(size for _, size, _ in columns) + gap * (len(columns) - 1)
    width = margin * 2 + label_width + content_width
    height = margin * 2 + 48 + row_height * len(ROWS)
    sheet = Image.new("RGB", (width, height), "#e9e1d2")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=16)

    x = margin + label_width
    for title, size, _ in columns:
        bounds = draw.textbbox((0, 0), title, font=font)
        text_width = bounds[2] - bounds[0]
        draw.text((x + (size - text_width) / 2, margin), title, fill="#103c2b", font=font)
        x += size + gap

    for row_index, (label, original_path, revised_path) in enumerate(ROWS):
        y = margin + 48 + row_index * row_height
        original = Image.open(original_path).convert("RGB")
        revised = Image.open(revised_path).convert("RGB")
        draw.text((margin, y + 18), label, fill="#103c2b", font=font)
        x = margin + label_width
        for _, size, use_revised in columns:
            source = revised if use_revised else original
            thumb = source.resize((size, size), RESAMPLE)
            sheet.paste(thumb, (x, y + 16))
            x += size + gap

    sheet.save(OUTPUT, "PNG", optimize=True)


if __name__ == "__main__":
    main()
