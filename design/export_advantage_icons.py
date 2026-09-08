"""Export the advantage icons in design/source-art to 128px webps in src/assets.

    uv run --with pillow python design/export_advantage_icons.py

Sources are RGBA PNGs on a transparent canvas; one per season plus the default.
New season: drop `sNN-advantage-icon.png` here, run this, add a line to
frontend/src/lib/advantages.ts.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "design" / "source-art"
OUT = ROOT / "frontend" / "src" / "assets"

for png in sorted(SRC.glob("*-advantage-icon.png")):
    out = OUT / (png.stem + ".webp")
    Image.open(png).convert("RGBA").resize((128, 128), Image.LANCZOS).save(
        out, "WEBP", quality=90, method=6
    )
    print(f"{png.name} -> {out.relative_to(ROOT)} ({out.stat().st_size} bytes)")
