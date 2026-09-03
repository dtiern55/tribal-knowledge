"""Build a review board matching the four Admin app-icon finalists."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
OUT = HERE / "admin-icon-finalists-contact-sheet.png"
FONT_REGULAR = "/usr/share/fonts/truetype/ubuntu/UbuntuSans[wdth,wght].ttf"
FONT_BOLD = "/usr/share/fonts/truetype/ubuntu/Ubuntu[wdth,wght].ttf"

OPTIONS = [
    ("Canvas · Unlocked", "heavy-brush-unlocked-70-30.png", "Heavy brush · 70/30 forest tone"),
    ("Canvas · Locked", "heavy-brush-locked.png", "Heavy brush · cream canvas"),
    ("Walnut · Dark", "darker-real-walnut.png", "Natural grain · deep walnut"),
    ("Walnut · Lighter", "darker-real-walnut-lighter.png", "Natural grain · lifted walnut"),
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
    board = Image.new("RGB", (2048, 2220), "#e9dfcd")
    draw = ImageDraw.Draw(board)
    draw.text((96, 64), "APP ICON FINALISTS", fill="#16392e", font=font(58, True))
    draw.text(
        (96, 135),
        "The four options saved at the bottom of Admin, with launcher-size checks.",
        fill="#57645d",
        font=font(28),
    )

    positions = [(96, 214), (1060, 214), (96, 1202), (1060, 1202)]
    for (label, filename, note), (x, y) in zip(OPTIONS, positions):
        draw.rounded_rectangle(
            (x, y, x + 892, y + 916),
            radius=42,
            fill="#f7efe1",
            outline="#d3c4ab",
            width=3,
        )
        icon = Image.open(HERE / filename)
        large = rounded_icon(icon, 704, 150)
        board.paste(large, (x + 94, y + 42), large)
        draw.text((x + 52, y + 773), label, fill="#173b30", font=font(34, True))
        draw.text((x + 52, y + 816), note, fill="#657068", font=font(22))

        preview_x = x + 664
        for size in (72, 48, 32):
            preview = rounded_icon(icon, size, max(7, round(size * 0.21)))
            board.paste(preview, (preview_x, y + 804 + (72 - size) // 2), preview)
            preview_x += size + 18

    board.save(OUT, "PNG", optimize=True)


if __name__ == "__main__":
    main()
