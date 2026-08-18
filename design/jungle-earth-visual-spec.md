# Jungle Earth visual direction

**Status:** Approved direction for implementation
**Last updated:** 2026-08-18

## Concept

Tribal Knowledge should feel like a well-designed field guide to the game — not a skeuomorphic prop. The theme comes from **bold geometric typography, tribal-inspired border patterns, and a saturated earth-tone palette** rather than from textures or illustrations. Clean enough to maintain; characterful enough to be unmistakably Tribal Knowledge.

**Theming level: 6–7 / 10.** Custom assets welcome. Signature visual moments on My Season (especially locked/reveal states). Other screens share the same world at lower intensity. The app should feel like a fun social game among friends — playful and characterful, never corporate.

This spec covers visual identity only — palette, typography, patterns, and state atmosphere. It does not change layout, components, UX structure, or gameplay.

## Palette

| Role | Hex | Usage |
| --- | --- | --- |
| **Forest** | `#1e3a2f` | Primary headings, score badge background, header bar, locked-state base |
| **Jade** | `#2e6b52` | Positive points, confirmed results, secondary accent |
| **Terracotta** | `#c45432` | Active tab indicator, wordmark accent, primary action, tribal border pattern |
| **Gold** | `#d4913a` | Tribal border pattern, tribe markers, lock timing, avatar borders |
| **Stone** | `#8b7358` | Secondary text, muted labels, inactive tabs |
| **Cream** | `#f2e9db` | Page background, content surfaces |
| **Ink** | `#1c1917` | Primary body text, castaway names |

### Semantic overrides

- **Positive scores:** Jade (`#2e6b52`)
- **Negative scores / warnings:** Terracotta or a rust variant
- **Lock timing / advantage status:** Gold (`#d4913a`)
- **Tribe colors:** Remain per-season data — shown as avatar borders and diamond markers

### Mapping from current palette

| Current | New | Notes |
| --- | --- | --- |
| `ocean-*` (blue accent) | Forest / Jade | Primary accent shifts from blue to green |
| `ember-*` (orange accent) | Terracotta / Gold | Warmer, earthier oranges |
| `sand-*` (background) | Cream + Stone | Similar warmth, slightly richer |
| `paper` (`#f7f0e2`) | Cream (`#f2e9db`) | A touch warmer/darker |
| `paper-ink` (`#2b2620`) | Ink (`#1c1917`) | Slightly cooler |
| `paper-ink-faded` (`#6f675a`) | Stone (`#8b7358`) | Warmer muted tone |

## Typography

| Role | Typeface | Weight | Use |
| --- | --- | --- | --- |
| **Brand** | Skranji | 700 | `TRIBAL KNOWLEDGE` wordmark only. "TRIBAL" in Forest, "KNOWLEDGE" in Terracotta. |
| **Display** | Rajdhani | 600, 700 | Season titles, section headings, tab labels, castaway names, scores. **Replaces Anton.** |
| **Body** | Source Sans 3 | 400, 600 | Body text, descriptions, form labels, helper copy, metadata. Tabular figures for scores. |
| **Accent** | Kalam | 400 | Ballot slips and rare handwritten annotations. Not a second body font. |

### Google Fonts import

```
Skranji:wght@400;700
Rajdhani:wght@400;500;600;700
Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400
Kalam:wght@400;700
```

### CSS custom properties

```css
--font-display: "Rajdhani", system-ui, sans-serif;
--font-brand: "Skranji", "Rajdhani", system-ui, sans-serif;
--font-body: "Source Sans 3", system-ui, sans-serif;
```

## Pattern language

### Tribal border

A repeating terracotta + gold dashed pattern used as a section divider. The one consistent decorative motif across the app — simple enough to implement in CSS, distinctive enough to be a signature.

```css
.tribal-border {
  height: 3px;
  background: repeating-linear-gradient(
    90deg,
    #c45432 0 8px,
    transparent 8px 12px,
    #d4913a 12px 16px,
    transparent 16px 20px
  );
  border-radius: 1px;
}
```

**Replaces** the current torch-to-jungle gradient stripe (`.torch-stripe`).

**Usage:** Below the app header, between major sections on My Season, below page headers on Standings and Cast.

**Locked-state variant:** Same pattern at reduced opacity.

```css
.tribal-border--dim {
  height: 2px;
  background: repeating-linear-gradient(
    90deg,
    rgba(196, 84, 50, 0.5) 0 8px,
    transparent 8px 12px,
    rgba(212, 145, 58, 0.35) 12px 16px,
    transparent 16px 20px
  );
}
```

### Diamond tribe markers

Small diamond-shaped pips in tribe color, replacing the current round dots.

```css
.tribe-marker {
  width: 8px;
  height: 8px;
  display: inline-block;
  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
  /* background set to tribe color dynamically */
}
```

### Tribe-bordered avatars

Round avatars with a 2.5px border in the castaway's tribe color. Connects each player to their tribe visually without needing a separate label column.

```css
.contestant-avatar {
  border-radius: 50%;
  border: 2.5px solid; /* border-color set to tribe color dynamically */
}
```

## Episode states

### Open — daylight, working state

- **Background:** Cream (`#f2e9db`) with a subtle ember radial glow in the top-right corner (carried over from current design, shifted to terracotta).
- **Header:** Forest (`#1e3a2f`) background, cream text.
- **Tribal border:** Full opacity.
- **Controls:** Fully interactive.
- **Feel:** Warm, inviting, legible, clean.

```css
/* Subtle corner glow — same concept as current .app-shell background-image */
.app-shell {
  background-image:
    radial-gradient(circle at 100% 0%, rgba(196, 84, 50, 0.08), transparent 62vw),
    linear-gradient(180deg, #f5f0e6, #f2e9db);
}
```

### Locked — tribal council night

- **Background:** Deep forest-night (`#0e1f19`).
- **Header / nav:** Near-black forest (`#0a1613`).
- **Ember glow:** Radial gradient from upper-right, terracotta-based (`rgba(196, 84, 50, 0.18)`).
- **Text:** Cream at varying opacities (90% names, 45% secondary, 35% muted).
- **Tribal border:** Dimmed variant.
- **Avatar borders:** Tribe colors at ~35% opacity.
- **Score badge:** Jade at 25% opacity background with jade border.
- **Feel:** Atmospheric, read-only, like viewing the ledger by firelight.

```css
html.locked-night {
  color-scheme: dark;
  background: #0e1f19;
}

html.locked-night .app-shell {
  background:
    radial-gradient(circle at 78% 8%, rgba(196, 84, 50, 0.18), transparent 28rem),
    linear-gradient(to bottom, #132e25, #0e1f19);
  color: #f2e9db;
}

html.locked-night .app-header,
html.locked-night .app-bottom-nav {
  border-color: rgba(242, 233, 219, 0.08);
  background: rgba(10, 22, 19, 0.94);
}
```

### Reveal — vivid aftermath

- **Background:** Brighter cream (`#f8f2e8`).
- **Stronger jade and terracotta:** More saturated for results emphasis.
- **Score marks:** Jade for positive, terracotta/rust for negative.
- **Feel:** Morning-after energy. The most colorful state — results land with impact.

## Consistency across screens

### My Season (flagship)

Full state treatment (open → locked → reveal). Tribal border under header. Tribe-bordered avatars. Diamond markers. Score badge in forest green.

### Standings

Same cream ground. Tribal border below page header. Player cards use the same avatar style. Ranking numbers in Rajdhani. Inherits locked-night when applicable.

### Cast

Same treatment. Torch icon in terracotta. Tribe-bordered avatars carry the system through.

### Header / navigation

- **Open/Reveal:** Forest (`#1e3a2f`) header background, cream text.
- **Locked:** Near-black forest (`#0a1613`) header, muted cream text.
- **Tribal border** replaces the current torch-to-jungle gradient stripe below the header.
- **Active nav item:** Terracotta.
- **Inactive nav items:** Stone.

## Implementation order

1. **Palette swap in `index.css`:** Replace `ocean-*`, `ember-*`, `sand-*` theme tokens with Forest, Jade, Terracotta, Gold, Stone, Cream, Ink equivalents.
2. **Typography swap:** Replace Anton with Rajdhani in `--font-display`. Update Google Fonts import in `index.html`.
3. **Tribal border:** Replace `.torch-stripe` with the new `.tribal-border` pattern. Add dimmed variant for locked state.
4. **Diamond tribe markers:** Update `ContestantAvatar` / tribe indicator components to use diamond clip-path instead of round dots.
5. **Tribe-bordered avatars:** Add tribe-color border to avatar components.
6. **Locked-night update:** Shift locked-night palette from ocean-dark to forest-dark. Update background, text colors, and glow to use new palette.
7. **Wordmark update:** "TRIBAL" in Forest, "KNOWLEDGE" in Terracotta (was both in one color or ocean-based).
8. **Active nav styling:** Switch active indicator from ember to terracotta.

## What this does NOT change

- Layout structure (3-tab My Season, Standings cards, Cast list)
- Component architecture or new components
- UX flows, state logic, or game mechanics
- Scoring rules or data model
- The existing Skranji brand font (stays as wordmark)
- Source Sans 3 as body font (stays)
- Kalam as ballot accent (stays)

## Reference artifacts

See `Direction Spec.dc.html` in the design project for rendered reference mockups of:
- My Season Open (roster tab) — full system applied
- My Season Locked — dark state with ember glow
