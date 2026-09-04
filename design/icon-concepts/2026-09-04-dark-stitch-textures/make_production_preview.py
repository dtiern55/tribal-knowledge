"""Build a visual QA board from the current production icon derivatives."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[2] / "frontend" / "public"
OUTPUT = HERE / "production-export-preview.png"
RESAMPLE = Image.Resampling.LANCZOS

BRAND = {
    "SNAKES": "#cd5e21",
    "AND": "#f3b939",
    "RATS": "#f6e1ad",
}


def labeled(draw: ImageDraw.ImageDraw, label: str, x: int, y: int, font: ImageFont.ImageFont) -> None:
    draw.text((x, y), label, fill="#103c2b", font=font)


def main() -> None:
    sheet = Image.new("RGB", (1120, 760), "#e9e1d2")
    draw = ImageDraw.Draw(sheet)
    label_font = ImageFont.load_default(size=16)
    title_font = ImageFont.load_default(size=24)
    word_font = ImageFont.load_default(size=30)
    draw.text((32, 24), "PRODUCTION ICON EXPORTS", fill="#103c2b", font=title_font)

    icon = Image.open(PUBLIC / "icon-512.webp").convert("RGB")
    maskable = Image.open(PUBLIC / "icon-512-maskable.webp").convert("RGB")
    apple = Image.open(PUBLIC / "apple-touch-icon.png").convert("RGB")

    labeled(draw, "STANDARD · 256PX", 32, 78, label_font)
    sheet.paste(icon.resize((256, 256), RESAMPLE), (32, 110))

    labeled(draw, "MASKABLE · CIRCLE PREVIEW", 320, 78, label_font)
    circle_source = maskable.resize((256, 256), RESAMPLE)
    circle_mask = Image.new("L", (256, 256), 0)
    ImageDraw.Draw(circle_mask).ellipse((0, 0, 255, 255), fill=255)
    sheet.paste(circle_source, (320, 110), circle_mask)

    labeled(draw, "APPLE TOUCH · 180PX", 608, 78, label_font)
    sheet.paste(apple, (608, 110))

    labeled(draw, "LAUNCHER CHECKS", 32, 408, label_font)
    x = 32
    for size in (48, 64, 96, 128):
        thumb = icon.resize((size, size), RESAMPLE)
        sheet.paste(thumb, (x, 448 + 128 - size))
        draw.text((x, 588), f"{size}px", fill="#315847", font=label_font)
        x += size + 28

    labeled(draw, "BROWSER FAVICONS · ACTUAL / PIXEL PREVIEW", 608, 408, label_font)
    x = 608
    for size in (16, 32, 48):
        favicon = Image.open(PUBLIC / f"favicon-{size}x{size}.png").convert("RGB")
        sheet.paste(favicon, (x, 454))
        sheet.paste(favicon.resize((size * 3, size * 3), Image.Resampling.NEAREST), (x, 500))
        draw.text((x, 658), f"{size}px", fill="#315847", font=label_font)
        x += max(size * 3, 72) + 24

    draw.rounded_rectangle((32, 684, 1088, 736), radius=10, fill="#1e3a2f")
    x = 54
    for word, color in BRAND.items():
        draw.text((x, 693), word, fill=color, font=word_font)
        bounds = draw.textbbox((x, 693), word, font=word_font)
        x = bounds[2] + 18

    sheet.save(OUTPUT, "PNG", optimize=True)


if __name__ == "__main__":
    main()
