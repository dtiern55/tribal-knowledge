"""Export the approved wood marks to the frontend's icon assets."""

from pathlib import Path

from PIL import Image, ImageFilter


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
SOURCE_APP = HERE.parent / "snakes-and-rats-locked.png"
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

    # Build a low-contrast cream field from a background-only source crop. The
    # lower contrast keeps launcher masks from exposing a framed inner square.
    texture = source.crop((0, 0, 256, 256)).resize((512, 512), RESAMPLE)
    cream = Image.new("RGB", (512, 512), "#f2e9db")
    background = Image.blend(cream, texture, 0.22)
    background = background.filter(ImageFilter.GaussianBlur(0.55))

    inset_size = 384
    inset = resized(source, inset_size)
    alpha = Image.new("L", (inset_size, inset_size), 0)
    source_pixels = inset.load()
    alpha_pixels = alpha.load()
    for y in range(inset_size):
        for x in range(inset_size):
            red, green, blue = source_pixels[x, y]
            high = max(red, green, blue) / 255
            low = min(red, green, blue) / 255
            saturation = (high - low) / high if high else 0

            # The three colored silhouettes are substantially more saturated
            # than the cream field. Very dark pixels preserve their outlines.
            color_weight = min(1.0, max(0.0, (saturation - 0.48) / 0.24))
            shadow_weight = min(1.0, max(0.0, (0.42 - high) / 0.22))
            alpha_pixels[x, y] = round(255 * max(color_weight, shadow_weight))

    alpha = alpha.filter(ImageFilter.GaussianBlur(0.65))

    background.paste(inset, ((512 - inset_size) // 2,) * 2, alpha)
    return background


def main() -> None:
    app = Image.open(SOURCE_APP).convert("RGB")
    puzzle_dark = Image.open(PUZZLE_DARK).convert("RGB")
    puzzle_light = Image.open(PUZZLE_LIGHT).convert("RGB")
    for source in (app, puzzle_dark, puzzle_light):
        if source.width != source.height:
            raise ValueError(f"Expected a square source, got {source.size}")

    save_webp(resized(app, 512), "icon-512.webp")
    save_webp(resized(app, 192), "icon-192.webp")
    save_webp(maskable_icon(app), "icon-512-maskable.webp")
    save_webp(resized(puzzle_dark, 640), "puzzle-wood-solid.webp")
    save_webp(resized(puzzle_light, 640), "puzzle-wood-light.webp")

    resized(app, 180).save(PUBLIC / "apple-touch-icon.png", "PNG", optimize=True)


if __name__ == "__main__":
    main()
