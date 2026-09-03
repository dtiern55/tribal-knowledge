"""Export the five user-selected app icons used by the Admin gallery."""

from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PUBLIC = REPO / "frontend" / "public"
RESAMPLE = Image.Resampling.LANCZOS

OPTIONS = {
    "selected-canvas-woven.png": "icon-option-canvas-woven.webp",
    "selected-canvas-heavy-dark.png": "icon-option-canvas-heavy-dark.webp",
    "selected-canvas-heavy-light.png": "icon-option-canvas-heavy-light.webp",
    "selected-walnut-dark.png": "icon-option-walnut-dark.webp",
    "selected-walnut-light.png": "icon-option-walnut-light.webp",
}


def main() -> None:
    for source_name, output_name in OPTIONS.items():
        image = Image.open(HERE / source_name).convert("RGB")
        if image.width != image.height:
            raise ValueError(f"Expected a square source, got {image.size}: {source_name}")
        image.resize((640, 640), RESAMPLE).save(
            PUBLIC / output_name,
            "WEBP",
            quality=92,
            method=6,
        )


if __name__ == "__main__":
    main()
