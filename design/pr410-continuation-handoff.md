# PR #410 — Expedition Ledger art pass: continuation handoff

**Branch:** `codex/expedition-ledger` · **HEAD at handoff:** `0e9c32b` · **PR:** #410
**Goal:** apply the illustrated "expedition ledger" look to **My Season first**, piece by piece, close to the approved mockup.

## The mockup (the one target)
`design/artifacts/my-season-ledger-roster.png` (also `/mnt/c/Users/danny/Downloads/my-season-ledger-roster.png`, **852×1846**, a 2× phone render). This is THE fidelity target — the clean product screenshot, **not** the busy art board (`expedition-ledger-style-board.png`, that's mood only). Danny confirmed this repeatedly.

## Working agreement (how this collaboration runs)
- **One piece at a time:** name the asset → produce it → wire it → Danny tests on the PR preview → next. Nothing compounds.
- **Sourcing = Claude rips from the mockup**, not generation. A crop of the mockup *is* the exact style (line weight, watercolor, grain). Generation (Codex) is fallback only for what the mockup can't yield.
- **Ponytail mode is active** (lazy-senior-dev: smallest correct change, don't gold-plate). We nearly over-polished the frame — resist that.
- Danny reviews via the **Vercel PR preview**, not local dev (he has no local dev/data). Frontend deploys per push; backend on Fly + Supabase.
- Git autonomy is granted in this repo (commit/push/merge/deploy without asking, no AI-attribution trailers). Focused commits.

## Piece pipeline & status
1. **Paper shell** — DONE (`de5ea28`). `page-surface.webp` fixed behind everything (day only; night keeps its dark room), header/nav translucent paper. Global, unconditional.
2. **Ledger paper** — DONE (folded into piece 1). `ledger-surface.webp` on `.record-paper` (day only).
3. **Record frame** — DONE (`0e9c32b`). See "The frame saga" below. Final = **CSS double-border run through an SVG turbulence+grain filter** (bold, hand-wobbled, ink-grained, crisp at all DPR).
4. **Row rule** — **NEXT.** The inked divider between roster rows. Currently uses Codex's generated `expedition-ink-rule.png` (via `.open-ledger .roster-card` top border). Rip the real rule from the mockup (a clean horizontal divider run between two rows, e.g. between Gabby/Natalia ~y=785 in the 852px mockup) or synthesize like the frame if a thin rip washes at 1× (see learning #1).
5. **Selected/doubled row wash** — asset ALREADY RIPPED. The exact ocean-blue watercolor from Christian's selected row lives at mockup **x≈432,y≈1082,w≈120,h≈112** (clean, text-free; tiles seamlessly). Codex's `expedition-selected-wash.png` is a generated stand-in; replace with the rip. Also the darker My Points slate-blue is at mockup **x≈600,y≈300,w≈212,h≈118**.
6. **Portrait mat** — mounted-photo frame. Currently Codex's `expedition-portrait-mat.png` (`.ledger-photo-mount::after`). Decide rip vs CSS when visible.

## THE HARD-WON LEARNINGS (these cost hours — read before touching the frame or any thin line)
1. **A ~1px line cannot render solid at 1× DPR.** It anti-aliases to a pale smudge. The mockup's frame/rules are hairlines that look fine only because the mockup is a 2× raster scaled as a whole. Ripping a thin line and placing it (border-image or overlay) **washes out on 1× desktops** (looked fine on retina/phone, white on desktop). This burned an entire debugging cycle. **Always verify at deviceScaleFactor:1.**
2. **`border-image` is a dead end for thin ripped lines:** corners survive (ink mass) but straight edges wash out at 1× regardless of dilation, border-width, repeat mode, or tight slices. Chrome's edge downscale filter lightens them.
3. **`var()` inside the `border-image` shorthand is dropped by browsers** → the whole declaration falls out → you see the fallback border-color (a white-frame bug). Use longhands. (Moot now — we abandoned border-image.)
4. **Vercel/Vite build cache can re-inline a STALE asset if the filename is unchanged.** When an asset's *content* changes, **change its filename too**. (This was a red-herring theory during the saga — the real issue was #1 — but the practice is still correct.)
5. **The service worker (`frontend/public/sw.js`) is a no-op** (no caching). Not a staleness source. Don't chase it.
6. **Vercel PR previews are SSO-protected** — you can't `curl` the deployed HTML/CSS anonymously (302 → vercel SSO). To check what's deployed, either render locally or ask Danny. Get the live preview URL for a commit via:
   `gh api repos/dtiern55/tribal-knowledge/deployments --jq '[.[]|select(.sha|startswith("<sha>"))][0].id'` then `.../deployments/<id>/statuses --jq '.[0].environment_url'`. Poll until state=success.
7. **The winning frame technique** (reusable for any inked line): a crisp CSS border (vector, bold at all DPR) run through an SVG filter = `feTurbulence`→`feDisplacementMap` (hand wobble) then a second high-freq `feTurbulence`→`feColorMatrix`(to alpha)→`feComposite operator="in"` (ink grain). Defs in `frontend/index.html` (`#ink-frame-a/#ink-frame-b`, two seeds so double lines wobble independently), applied via `filter:url(#…)` on `.expedition-ledger::before/::after` in `index.css`. **Tunables:** `baseFrequency 0.016`=wobble grain, `scale 3.2`=amplitude, the `0.7` grain turbulence=ink texture.

## The render/verify harness (CRITICAL — set this up first)
We can render real CSS+DOM in a headless browser and screenshot at any DPR, so **never push a visual change blind again — verify at DPR 1 locally first.**

Setup in your (new) scratchpad dir `$SP`:
```
cd "$SP" && npm install sharp playwright        # both needed; sharp for image crops, playwright for render
```
Headless Chromium is cached at `~/.cache/ms-playwright`. It needs `libasound.so.2`, which is NOT installed system-wide. A prior session staged it under a temp `libs/` dir; find one with:
```
find /tmp/claude-* -name 'libasound.so.2' 2>/dev/null | head -1
```
Then run node with `LD_LIBRARY_PATH="<dir containing libasound>:$LD_LIBRARY_PATH"`. If none found, `npx playwright install-deps chromium` needs sudo (Danny has a password; ask him to run it via `!`).

**The verify pattern** (see this session's `render4.js`/`verify.js` for a template): read the built `frontend/dist/assets/index-*.css`, inline it in a `<style>`, pull the `<svg>` filter defs straight out of `frontend/index.html`, build a faithful card DOM with the real classes (`record-paper expedition-ledger rounded-lg border border-paper-edge overflow-hidden open-ledger`), load `expedition-ledger-surface.webp` as a data-URI background, and screenshot `.expedition-ledger` at **deviceScaleFactor:1 AND 2**. Build first (`cd frontend && npm run build`).

**The rip pattern** (see `grid.js`): overlay a coordinate grid on the mockup (downscaled, labels in source coords) to pick exact crop rects, then `sharp(src).extract({left,top,width,height})`. To turn ink into transparent-background ink: `.greyscale().negate().blur(b).linear(slope,off).toColourspace('b-w')` as an alpha channel over a solid ink-color buffer. Gentle key (`linear(2.1,-105)`) keeps edges opaque; steep keys drop faint edges to transparent.

## Files changed this session (all in `frontend/`)
- `src/index.css` — piece 1 shell/header/nav (day-scoped, `html:not(.locked-night)`), `.record-paper` ledger paper, and the `.expedition-ledger::before/::after` SVG-filtered frame (search `Piece 1`, `Piece 3`).
- `index.html` — the two SVG filter defs (`#ink-frame-a/b`) in `<body>`.
- `src/pages/MySeasonPage.tsx` — removed the old `open-roster-art` gating (piece 1); kept `open-ledger` class on the roster-beat SeasonRecord.
- Codex's pre-existing work (kept): typography (Alegreya SC/Source Sans 3/Skranji/Kalam), wax seals, `.open-ledger` scoped styles (My Points box, name type, row rules, portrait mounts), state logic. **Do not rip these out.**

### Loose end to clean
`frontend/src/assets/expedition-ledger-frame-inked.png` is committed but **unused** (frame is now pure CSS/SVG). `git rm` it. Also unused: `expedition-ink-frame.png`, `expedition-paper-grain.webp` (Codex leftovers). Still USED: `page-surface.webp`, `ledger-surface.webp`, `expedition-ink-rule.png` (row rule, piece 4), `expedition-portrait-mat.png` (piece 6), `expedition-selected-wash.png` (piece 5), `wax-2x*.png`.

## Preview / DB state
- Latest good preview (`0e9c32b`): `https://tribal-knowledge-f4tuki5l6-dtiern55s-projects.vercel.app`
- **DB tweak in effect:** to let Danny view the *unlocked* My Season, DvG **Episode 4** `picks_lock_at` was moved to **2026-08-18 00:00 UTC** (Mon Aug 17, 7:00 PM Central). It **re-locks then** — if you're past that, bump it again. Episode id `bc3df062-a8f0-4166-9bef-520f1c5292c7`; original value was `2026-08-17 00:00 UTC`. Season is the DvG **test/seed** season (`6be3dfa2-…`), safe to modify.
- **DB access:** `cd backend && .venv/bin/python`, `load_dotenv(dotenv_path=".env")` (bare `load_dotenv()` fails from a heredoc), connect with `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`. State logic that decides open/locked: `frontend/src/lib/episodes.ts` (`openEpisode` = lowest unscored ep ≥ roster_lock with `picks_lock_at > now`) + `mySeasonState.ts`.

## NEXT: piece 4 — the row rule
The horizontal divider between roster rows. Rip the real inked rule from the mockup (a clean divider run between two rows), and expect it to be a hairline → likely needs the same treatment as the frame (a thin CSS border run through a light displacement filter, OR a `repeat-x` of a bold-enough rip). **Verify at DPR 1 before pushing.** It currently renders via `.open-ledger .roster-card { background-image: url(expedition-ink-rule.png) … }` — replace that.
