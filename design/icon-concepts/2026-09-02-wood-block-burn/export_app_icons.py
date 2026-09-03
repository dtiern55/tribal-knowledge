"""Export the approved wood marks to the frontend's icon assets."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
SOURCE_DARK = HERE / "wood-block-burn-v2-solid-background.png"
PUZZLE_DARK = HERE / "wood-block-burn-v6-readable-dark.png"
PUZZLE_LIGHT = HERE / "wood-block-burn-v5-fine-light.png"
PUBLIC = REPO / "frontend" / "public"
RESAMPLE = Image.Resampling.LANCZOS
FAVICON_BACKGROUND = "#1e3a2f"
FAVICON_BODY = "#d76c4d"
FAVICON_CREAM = "#f8f2e8"


def resized(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), RESAMPLE)


def save_webp(image: Image.Image, name: str) -> None:
    image.save(PUBLIC / name, "WEBP", quality=92, method=6)


def favicon_mark(size: int = 512) -> Image.Image:
    """Render the favicon-first coiled snake defined in favicon.svg."""

    scale = size / 64
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(bounds: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
        return tuple(round(value * scale) for value in bounds)

    draw.rounded_rectangle(
        (scale, scale, 63 * scale, 63 * scale),
        radius=12 * scale,
        fill=FAVICON_BACKGROUND,
    )

    # Lower coil and its single broad band.
    draw.ellipse(box((5, 35, 59, 61)), fill=FAVICON_BODY)
    draw.ellipse(box((7, 42, 57, 56)), fill=FAVICON_CREAM)
    draw.ellipse(box((9, 49, 55, 60)), fill=FAVICON_BODY)

    # Neck, upper coil, and the negative-space opening between them.
    draw.rounded_rectangle(box((24, 17, 41, 45)), radius=round(8 * scale), fill=FAVICON_BODY)
    draw.ellipse(box((10, 31, 54, 49)), fill=FAVICON_BODY)
    draw.ellipse(box((17, 35, 47, 43)), fill=FAVICON_BACKGROUND)
    draw.rounded_rectangle(box((24, 35, 41, 46)), radius=round(7 * scale), fill=FAVICON_BODY)

    # Oversized head and eyes remain discrete at the 16px export.
    draw.ellipse(box((20, 5, 46, 27)), fill=FAVICON_BODY)
    draw.ellipse(box((23, 10, 32, 19)), fill=FAVICON_CREAM)
    draw.ellipse(box((35, 10, 44, 19)), fill=FAVICON_CREAM)
    draw.ellipse(box((27, 12, 31, 17)), fill=FAVICON_BACKGROUND)
    draw.ellipse(box((39, 12, 43, 17)), fill=FAVICON_BACKGROUND)
    return image


def maskable_icon(source: Image.Image) -> Image.Image:
    """Keep the whole mark inside Android's central maskable safe zone."""

    # This source crop is wood only. Enlarging and lightly softening it creates
    # a quiet, edge-to-edge field behind the padded full composition.
    background = source.crop((0, 0, 400, 400)).resize((512, 512), RESAMPLE)
    background = background.filter(ImageFilter.GaussianBlur(0.45))

    inset_size = 384
    inset = resized(source, inset_size)
    feather = 18
    alpha = Image.new("L", (inset_size, inset_size), 255)
    pixels = alpha.load()
    for y in range(inset_size):
        for x in range(inset_size):
            edge_distance = min(x, y, inset_size - 1 - x, inset_size - 1 - y)
            if edge_distance < feather:
                pixels[x, y] = round(255 * edge_distance / feather)

    background.paste(inset, ((512 - inset_size) // 2,) * 2, alpha)
    return background


def main() -> None:
    dark = Image.open(SOURCE_DARK).convert("RGB")
    puzzle_dark = Image.open(PUZZLE_DARK).convert("RGB")
    puzzle_light = Image.open(PUZZLE_LIGHT).convert("RGB")
    for source in (dark, puzzle_dark, puzzle_light):
        if source.width != source.height:
            raise ValueError(f"Expected a square source, got {source.size}")

    save_webp(resized(dark, 512), "icon-512.webp")
    save_webp(resized(dark, 192), "icon-192.webp")
    save_webp(maskable_icon(dark), "icon-512-maskable.webp")
    save_webp(resized(puzzle_dark, 640), "puzzle-wood-solid.webp")
    save_webp(resized(puzzle_light, 640), "puzzle-wood-light.webp")

    resized(dark, 180).save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)
    favicon_mark().save(
        PUBLIC / "favicon.ico",
        "ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )


if __name__ == "__main__":
    main()
