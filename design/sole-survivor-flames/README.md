# Sole Survivor flame exploration

This study tests two still-in-game treatments for the designated Sole Survivor on the My Season roster.

## Product assumption

"Entire card" means the designated castaway's roster row, not the full roster manifest. This is a visual-only change; designation rules, scoring, and privacy stay unchanged.

## Direction 1 — Ember Card

- Gives the designated row a dark forest base with a low-opacity flame perimeter.
- Creates the clearest, most ceremonial moment.
- Competes more with points, expansion, roster-double selection, and the daylight ledger hierarchy.
- Best if Sole Survivor should feel like a rare hero state rather than a roster attribute.

## Direction 2 — Portrait Halo

- Adds an incomplete transparent flame ring around the existing 42px portrait.
- Preserves row height, paper surface, points, tribe color, and interaction states.
- Keeps the emphasis on the castaway rather than turning the whole row into another container.
- Recommended for the production treatment.

## Implementation guardrails

- Keep the effect static during normal viewing; if designation gets a one-time ignition transition, disable it under `prefers-reduced-motion`.
- Keep the existing Sole Survivor label for clarity and accessibility.
- Apply flame artwork with `pointer-events: none` so row selection and expansion remain unchanged.
- For an eliminated designee, remove the live orange flame or convert it to a dim ash treatment so it matches the existing snuffed-champion behavior.
- Match the designated castaway's portrait border to the flame's pale-gold highlight.

## Assets

- `comparison.png` — rendered side-by-side at the real roster-card proportions.
- `implementation.png` — production `RosterCard` rendered at a 390px mobile viewport.

The flame artwork was created with the built-in ImageGen workflow. The prompt targeted restrained amber/orange fire, no text or watermark, and generous negative space for UI content.
