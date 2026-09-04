"""Build a review board matching the five user-selected Admin app icons."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
OUT = HERE / "admin-icon-finalists-contact-sheet.png"
FONT_REGULAR = "/usr/share/fonts/truetype/ubuntu/UbuntuSans[wdth,wght].ttf"
FONT_BOLD = "/usr/share/fonts/truetype/ubuntu/Ubuntu[wdth,wght].ttf"

OPTIONS = [
    ("Canvas · Woven", "selected-canvas-woven.png", "Fine texture · deep forest"),
    ("Canvas · Heavy dark", "selected-canvas-heavy-dark.png", "Heavy brush · deep forest"),
    ("Canvas · Heavy light", "selected-canvas-heavy-light.png", "Heavy brush · lighter forest"),
    ("Walnut · Dark", "selected-walnut-dark.png", "Natural grain · deep walnut"),
    ("Walnut · Lighter", "selected-walnut-light.png", "Natural grain · lifted walnut"),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)


def rounded_icon(image: Image.Image, size: int, radius: int) -> Image.Image:
    image = image.convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(image, (0, 0), mask)
    return out


def main() -> None:
    board = Image.new("RGB", (2048, 1640), "#e9dfcd")
    draw = ImageDraw.Draw(board)
    draw.text((96, 64), "APP ICON FINALISTS", fill="#16392e", font=font(58, True))
    draw.text(
        (96, 135),
        "The five selected originals saved at the bottom of Admin, with launcher-size checks.",
        fill="#57645d",
        font=font(28),
    )

    positions = [(96, 214), (728, 214), (1360, 214), (412, 920), (1044, 920)]
    for (label, filename, note), (x, y) in zip(OPTIONS, positions):
        draw.rounded_rectangle(
            (x, y, x + 592, y + 650),
            radius=42,
            fill="#f7efe1",
            outline="#d3c4ab",
            width=3,
        )
        icon = Image.open(HERE / filename)
        large = rounded_icon(icon, 440, 94)
        board.paste(large, (x + 76, y + 34), large)
        draw.text((x + 42, y + 500), label, fill="#173b30", font=font(30, True))
        draw.text((x + 42, y + 540), note, fill="#657068", font=font(20))

        preview_x = x + 374
        for size in (64, 44, 28):
            preview = rounded_icon(icon, size, max(7, round(size * 0.21)))
            board.paste(preview, (preview_x, y + 566 + (64 - size) // 2), preview)
            preview_x += size + 14

    board.save(OUT, "PNG", optimize=True)


if __name__ == "__main__":
    main()
