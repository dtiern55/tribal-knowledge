# Season 27 idol x2 trace

This concept uses the supplied `design-archive/inspiration/idol.png` photograph
as the geometry source for the red-cord Blood vs. Water medallion.

`trace_season27_idol.py` rectifies the visible disk face, classifies the dark
raised relief, removes only isolated photographic noise, and converts the
resulting boundary into SVG paths. The turquoise field remains recessed. The
red cord and x2 coin are separate foreground layers, so the medallion pattern
continues unchanged behind the coin instead of moving around it.

The source photograph exposes roughly 150 pixels across the idol. That is more
than the app's 22px presentation needs, but it is not archival-resolution
reference art. Geometry hidden by the red cord is deliberately left hidden by
the traced cord rather than invented.

Run the trace with the Codex workspace Python runtime (Pillow and NumPy), then
render the SVG with Sharp:

```powershell
& $codexPython trace_season27_idol.py
$env:NODE_PATH = $codexNodeModules
& $codexNode -e "require('sharp')('season-27-idol-x2-traced.svg').resize(1254).png().toFile('season-27-idol-x2-traced.png')"
```
