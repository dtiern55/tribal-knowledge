"""Trace the visible Season 27 idol geometry into a deterministic SVG.

The supplied photograph is intentionally the source of truth for the raised
motif.  The script rectifies the red-cord idol to a circle, classifies the dark
raised relief, removes tiny photographic noise, and converts the resulting
binary boundary to SVG paths.  Cord and x2 badge are authored as independent
foreground layers so neither changes the medallion geometry beneath it.
"""

from __future__ import annotations

from collections import defaultdict, deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
REFERENCE = REPO_ROOT.parent / "design-archive" / "inspiration" / "idol.png"

# Tight, nearly front-on bounds of the red-cord medallion in the supplied photo.
# The one-pixel vertical difference corrects its slight photographic ellipse.
PHOTO_CROP = (243, 240, 391, 389)
TRACE_SIZE = 512


def remove_small_components(mask: np.ndarray, minimum_area: int = 7) -> np.ndarray:
    """Remove isolated threshold noise while retaining the photographed glyphs."""

    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    kept = np.zeros_like(mask, dtype=bool)

    for start_y, start_x in np.argwhere(mask):
        if seen[start_y, start_x]:
            continue

        queue: deque[tuple[int, int]] = deque([(int(start_y), int(start_x))])
        seen[start_y, start_x] = True
        component: list[tuple[int, int]] = []

        while queue:
            y, x = queue.popleft()
            component.append((y, x))
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                ny, nx = y + dy, x + dx
                if (
                    0 <= ny < height
                    and 0 <= nx < width
                    and mask[ny, nx]
                    and not seen[ny, nx]
                ):
                    seen[ny, nx] = True
                    queue.append((ny, nx))

        if len(component) >= minimum_area:
            ys, xs = zip(*component)
            kept[np.asarray(ys), np.asarray(xs)] = True

    return kept


def collapse_collinear(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if len(points) < 4:
        return points

    collapsed = [points[0]]
    for index in range(1, len(points) - 1):
        previous = collapsed[-1]
        current = points[index]
        following = points[index + 1]
        first_direction = (current[0] - previous[0], current[1] - previous[1])
        second_direction = (following[0] - current[0], following[1] - current[1])
        if first_direction != second_direction:
            collapsed.append(current)
    collapsed.append(points[-1])
    return collapsed


def mask_to_svg_path(mask: np.ndarray) -> str:
    """Convert a pixel mask to exact orthogonal SVG boundary loops."""

    height, width = mask.shape
    outgoing: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    unused: set[tuple[tuple[int, int], tuple[int, int]]] = set()

    def add_edge(start: tuple[int, int], end: tuple[int, int]) -> None:
        outgoing[start].append(end)
        unused.add((start, end))

    for y, x in np.argwhere(mask):
        y, x = int(y), int(x)
        if y == 0 or not mask[y - 1, x]:
            add_edge((x, y), (x + 1, y))
        if x == width - 1 or not mask[y, x + 1]:
            add_edge((x + 1, y), (x + 1, y + 1))
        if y == height - 1 or not mask[y + 1, x]:
            add_edge((x + 1, y + 1), (x, y + 1))
        if x == 0 or not mask[y, x - 1]:
            add_edge((x, y + 1), (x, y))

    loops: list[list[tuple[int, int]]] = []
    while unused:
        start_edge = next(iter(unused))
        unused.remove(start_edge)
        start, current = start_edge
        points = [start, current]

        while current != start:
            candidates = [
                end for end in outgoing[current] if (current, end) in unused
            ]
            if not candidates:
                break
            next_point = candidates[0]
            unused.remove((current, next_point))
            current = next_point
            points.append(current)

        if current == start and len(points) >= 5:
            loops.append(collapse_collinear(points))

    path_parts: list[str] = []
    for loop in loops:
        commands = [f"M{loop[0][0]} {loop[0][1]}"]
        commands.extend(f"L{x} {y}" for x, y in loop[1:-1])
        commands.append("Z")
        path_parts.append(" ".join(commands))
    return " ".join(path_parts)


def build_trace() -> tuple[np.ndarray, str]:
    source = Image.open(REFERENCE).convert("RGB")
    crop = source.crop(PHOTO_CROP).resize(
        (TRACE_SIZE, TRACE_SIZE), Image.Resampling.LANCZOS
    )
    rgb = np.asarray(crop, dtype=np.float32)
    luminance = (
        0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    )

    yy, xx = np.ogrid[:TRACE_SIZE, :TRACE_SIZE]
    radius = np.sqrt(
        ((xx - (TRACE_SIZE - 1) / 2) / (TRACE_SIZE / 2)) ** 2
        + ((yy - (TRACE_SIZE - 1) / 2) / (TRACE_SIZE / 2)) ** 2
    )

    # Exclude the red cord before tracing the relief. Its source-faithful curve
    # is represented by the independent foreground cord layer in the SVG.
    red_cord = (
        (rgb[:, :, 0] > rgb[:, :, 1] * 1.35 + 20)
        & (rgb[:, :, 0] > rgb[:, :, 2] * 1.25 + 20)
        & (rgb[:, :, 0] > 75)
    )

    ornament_band = (radius > 0.24) & (radius < 0.83)
    raised = (luminance < 90) & ornament_band & ~red_cord

    # A single median pass joins photographic edge fragments without redrawing
    # their contours; small connected flecks are then discarded.
    raised_image = Image.fromarray((raised * 255).astype(np.uint8)).filter(
        ImageFilter.MedianFilter(3)
    )
    raised = np.asarray(raised_image) >= 128
    raised = remove_small_components(raised, minimum_area=24)
    return raised, mask_to_svg_path(raised)


def write_mask_preview(mask: np.ndarray) -> None:
    preview = Image.new("RGB", (TRACE_SIZE, TRACE_SIZE), "#4f958d")
    pixels = np.asarray(preview).copy()
    pixels[mask] = np.array([56, 42, 32], dtype=np.uint8)

    yy, xx = np.ogrid[:TRACE_SIZE, :TRACE_SIZE]
    radius = np.sqrt(
        ((xx - (TRACE_SIZE - 1) / 2) / (TRACE_SIZE / 2)) ** 2
        + ((yy - (TRACE_SIZE - 1) / 2) / (TRACE_SIZE / 2)) ** 2
    )
    pixels[radius >= 0.98] = np.array([18, 16, 14], dtype=np.uint8)
    Image.fromarray(pixels).resize((768, 768), Image.Resampling.NEAREST).save(
        HERE / "season-27-idol-trace-mask.png"
    )


def write_svg(path_data: str) -> None:
    # The trace is transformed from its 512px source plane into the medallion's
    # face.  The x2 group appears last, so it occludes—never deforms—the trace.
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="3" dy="5" stdDeviation="4" flood-color="#0c0907" flood-opacity="0.48"/>
    </filter>
    <filter id="coin-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="2" dy="3" stdDeviation="2.5" flood-color="#0c0907" flood-opacity="0.55"/>
    </filter>
    <mask id="disk-cutout">
      <rect width="512" height="512" fill="black"/>
      <circle cx="220" cy="235" r="194" fill="white"/>
      <circle cx="220" cy="235" r="31" fill="black"/>
    </mask>
    <clipPath id="disk-clip">
      <circle cx="220" cy="235" r="194"/>
    </clipPath>
  </defs>

  <g filter="url(#shadow)" mask="url(#disk-cutout)">
    <circle cx="220" cy="235" r="194" fill="#2e241c"/>
    <circle cx="220" cy="235" r="185" fill="#6d5945"/>
    <circle cx="220" cy="235" r="178" fill="#2d241d"/>
    <circle cx="220" cy="235" r="170" fill="#3d746d"/>
    <circle cx="220" cy="235" r="162" fill="#4f958d"/>

    <!-- Shadow and face of the literal threshold trace from the photograph. -->
    <path d="{path_data}" transform="translate(43.5 59) scale(0.69725)"
          fill="#241a14" fill-rule="evenodd" opacity="0.72"/>
    <path d="{path_data}" transform="translate(41.5 56.5) scale(0.69725)"
          fill="#3a2b21" stroke="#806c56" stroke-width="0.65"
          vector-effect="non-scaling-stroke" fill-rule="evenodd"/>

    <circle cx="220" cy="235" r="48" fill="#3a2b21" stroke="#806c56" stroke-width="3"/>
    <circle cx="220" cy="235" r="37" fill="#211812"/>
  </g>

  <!-- One relaxed cord, independent from the medallion design. -->
  <path d="M14 57 C64 57 104 70 139 102 C164 125 183 154 199 183 C210 202 217 220 220 239"
        fill="none" stroke="#511b18" stroke-width="22" stroke-linecap="round"/>
  <path d="M14 57 C64 57 104 70 139 102 C164 125 183 154 199 183 C210 202 217 220 220 239"
        fill="none" stroke="#a9342a" stroke-width="17" stroke-linecap="round"/>
  <path d="M14 57 C64 57 104 70 139 102 C164 125 183 154 199 183 C210 202 217 220 220 239"
        fill="none" stroke="#cf5b48" stroke-width="4" stroke-linecap="round"
        stroke-dasharray="3 8" opacity="0.72"/>

  <!-- Foreground overlay: this group never participates in the trace layout. -->
  <g filter="url(#coin-shadow)">
    <circle cx="382" cy="377" r="88" fill="#183f34"/>
    <circle cx="382" cy="377" r="78" fill="#315e4e"/>
    <circle cx="382" cy="377" r="70" fill="#df9822"/>
    <circle cx="382" cy="377" r="66" fill="#e6a52e"/>
    <text x="382" y="397" text-anchor="middle" fill="#302219"
          font-family="Arial Black, Arial, sans-serif" font-size="59" font-weight="900"
          letter-spacing="-3">x2</text>
  </g>
</svg>
'''
    (HERE / "season-27-idol-x2-traced.svg").write_text(svg, encoding="utf-8")


def main() -> None:
    mask, path_data = build_trace()
    write_mask_preview(mask)
    write_svg(path_data)
    print(f"reference: {REFERENCE}")
    print(f"trace pixels: {int(mask.sum())}")
    print(f"svg path characters: {len(path_data)}")
    print(f"wrote: {HERE / 'season-27-idol-trace-mask.png'}")
    print(f"wrote: {HERE / 'season-27-idol-x2-traced.svg'}")


if __name__ == "__main__":
    main()
