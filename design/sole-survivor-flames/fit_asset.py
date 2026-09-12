"""Measure the Sole Survivor flame-ring asset and derive its CSS fit.

The production asset (`frontend/public/sole-survivor-flame-halo.png`) is a
photographic fire ring on black, keyed to transparency and recentred so the ring
is dead-centre — that recentring is what makes the CSS `background: center`
land the flames on the portrait. This script reports the ring geometry and the
`--sole-survivor-halo-size` values the CSS uses, so the sizing stays measured
rather than eyeballed if the asset is ever regenerated.

    uv run --with pillow,numpy,scipy python design/sole-survivor-flames/fit_asset.py

The COMPACT fit tucks the inner half of the (thick) flame band behind the
portrait, leaving a ~7px ring licking past the rim. Set TUCK=1.04 for a
"dramatic" fit that instead tucks only to the inner edge (much larger halo).
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

ASSET = sys.argv[1] if len(sys.argv) > 1 else "frontend/public/sole-survivor-flame-halo.png"
PORTRAITS = {"md": 36, "lg": 42}   # ContestantAvatar sizes the halo wraps
COMPACT = 0.73                     # portrait covers the inner half of the band


def main() -> None:
    im = Image.open(ASSET).convert("RGBA")
    w, h = im.size
    alpha = np.asarray(im.split()[3], dtype=np.float32)
    fire = alpha > 40

    # ring centre = centroid of the enclosed inner hole (fall back to fire centroid)
    closed = ndimage.binary_closing(fire, structure=np.ones((5, 5)))
    hole = ndimage.binary_fill_holes(closed) & ~closed
    lbl, n = ndimage.label(hole)
    if n:
        big = 1 + int(np.argmax(ndimage.sum(np.ones_like(lbl), lbl, range(1, n + 1))))
        cy, cx = ndimage.center_of_mass(lbl == big)
    else:
        cy, cx = ndimage.center_of_mass(fire)

    inner_r = ndimage.distance_transform_edt(~fire)[int(round(cy)), int(round(cx))]
    ys, xs = np.nonzero(fire)
    inner_frac = inner_r / (w / 2)

    print(f"asset {w}x{h}")
    print(f"ring centre offset from image centre: "
          f"({cx - w / 2:+.0f},{cy - h / 2:+.0f}) px  (want ~0,0 — recentred asset)")
    print(f"inner clear radius: {inner_r:.0f}px = {inner_frac * 100:.1f}% of half-width")
    for name, px in PORTRAITS.items():
        box = px / inner_frac * COMPACT
        print(f"  {name}: {px}px portrait -> --sole-survivor-halo-size: {box:.0f}px")


if __name__ == "__main__":
    main()
