"""Measure the Sole Survivor flame-ring asset and derive its CSS fit.

The production asset (`frontend/public/sole-survivor-flame-halo.png`) is a
photographic fire ring on black, keyed to transparency and recentred so the ring
is dead-centre — that recentring is what makes the CSS `background: center` land
the flames on the portrait. This reports the ring geometry and the
`--sole-survivor-halo-size` the CSS uses, so the sizing stays measured if the
asset is ever regenerated.

    uv run --with pillow,numpy,scipy python design/sole-survivor-flames/fit_asset.py

Centre + radius come from a least-squares circle fit to the ring's inner edge,
which works whether the ring is full or an intentionally one-sided/windswept
ring (a hole-centroid method breaks on the latter — the near-black side leaves
the hole open).

FIT scales the halo box relative to the ring. 0.73 = COMPACT: the portrait
covers the inner half of a thick band, leaving a ~7px ring (used for a full
ring like #16). 1.0 = LOOSE: barely tucked, so a one-sided ring's concentrated
flames stay visible (used for the windswept #17). Set it to match the asset.
"""
import sys, math
import numpy as np
from PIL import Image
from scipy import ndimage

ASSET = sys.argv[1] if len(sys.argv) > 1 else "frontend/public/sole-survivor-flame-halo.png"
FIT = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
PORTRAITS = {"md": 36, "lg": 42}


def kasa(pts):
    x, y = pts[:, 0], pts[:, 1]
    z = x * x + y * y
    a, b, c = np.linalg.lstsq(np.c_[2 * x, 2 * y, np.ones(len(x))], z, rcond=None)[0]
    return a, b, math.sqrt(c + a * a + b * b)


def inner_edge(mask, cx, cy):
    h, w = mask.shape
    maxr = int(min(w, h) * 0.5)
    pts = []
    for deg in range(360):
        dx, dy = math.cos(math.radians(deg)), math.sin(math.radians(deg))
        for r in range(int(maxr * 0.1), maxr):
            xx, yy = int(cx + dx * r), int(cy + dy * r)
            if 0 <= xx < w and 0 <= yy < h and mask[yy, xx]:
                pts.append((xx, yy))
                break
    pts = np.array(pts, float)
    rr = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
    return pts[np.abs(rr - np.median(rr)) < 0.35 * np.median(rr)]


def main() -> None:
    im = Image.open(ASSET).convert("RGBA")
    w, h = im.size
    mask = np.asarray(im.split()[3], np.float32) > 12   # include the dim ember thread
    cx, cy = w / 2, h / 2
    for _ in range(3):
        cx, cy, R = kasa(inner_edge(mask, cx, cy))
    inner_frac = R / (w / 2)

    print(f"asset {w}x{h}  (FIT={FIT})")
    print(f"ring centre offset from image centre: ({cx - w / 2:+.0f},{cy - h / 2:+.0f}) px  "
          f"(want ~0,0 — recentred asset)")
    print(f"ring inner radius: {R:.0f}px = {inner_frac * 100:.1f}% of half-width")
    for name, px in PORTRAITS.items():
        print(f"  {name}: {px}px portrait -> --sole-survivor-halo-size: {px / inner_frac * FIT:.0f}px")


if __name__ == "__main__":
    main()
