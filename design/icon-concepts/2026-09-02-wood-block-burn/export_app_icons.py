"""Export the approved wood marks to the frontend's icon assets."""

from pathlib import Path

from PIL import Image, ImageFilter


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
SOURCE_DARK = HERE / "wood-block-burn-v2-solid-background.png"
PUZZLE_DARK = HERE / "wood-block-burn-v6-readable-dark.png"
PUZZLE_LIGHT = HERE / "wood-block-burn-v5-fine-light.png"
PUBLIC = REPO / "frontend" / "public"
RESAMPLE = Image.Resampling.LANCZOS


def resized(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), RESAMPLE)


def save_webp(image: Image.Image, name: str) -> None:
    image.save(PUBLIC / name, "WEBP", quality=92, method=6)


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
    # Browser tabs render this mark at just 16px. The locked puzzle's pale
    # field keeps the rat, snake, and flame distinct at that size, while the
    # dark treatment remains the better fit for larger installed-app icons.
    puzzle_light.save(
        PUBLIC / "favicon.ico",
        "ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )


if __name__ == "__main__":
    main()
