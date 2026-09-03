"""Export the four app-icon finalists used by the Admin comparison gallery."""

from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PUBLIC = REPO / "frontend" / "public"
RESAMPLE = Image.Resampling.LANCZOS

OPTIONS = {
    "heavy-brush-unlocked-70-30.png": "icon-option-canvas-unlocked.webp",
    "heavy-brush-locked.png": "icon-option-canvas-locked.webp",
    "darker-real-walnut.png": "icon-option-walnut-dark.webp",
    "darker-real-walnut-lighter.png": "icon-option-walnut-light.webp",
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
