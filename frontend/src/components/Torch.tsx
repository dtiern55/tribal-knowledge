import { SNUFFED } from './torchPaths'

/**
 * The Standings torch, one per castaway on a roster (#723).
 *
 * Lit is the results card's flame with a glow: a radial blend held low in the
 * flame, pale at the heart, out to gold, a shade darker at the edge. Snuffed is
 * Codex's smoke-over-ember drawing, traced to vector so it can take the same
 * blended treatment: the ember lit like the flame's heart, ash darkening toward
 * the foot, smoke cooling from brown to grey and thinning as it rises.
 *
 * Both share a 16-unit box with the base on the bottom edge, so a row of mixed
 * torches sits on one baseline. Render {@link TorchDefs} once on the page.
 */

// The flame path spans x 7–17, y 2–18 of its 24-unit box; the viewBox crops
// to that so the flame fills the slot and its base lands on the slot's edge.
const FLAME_PATH = 'M12 2c1 4 5 5 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-10z'
const VIEWBOX = '4 2 16 16'

// The traced drawing is in its own pixel space; place it to span y 2–18 and
// centre on x 12, the flame's footprint.
const SCALE = 16 / SNUFFED.height
const PLACE = `translate(${(12 - (SNUFFED.width * SCALE) / 2).toFixed(3)} 2) scale(${SCALE.toFixed(5)})`

const SMOKE = '#604830'
const ASH_DARK = '#3a2a1c'
const PALE = '#f6dc9a'

/** Gradient definitions shared by every torch on the page. */
export function TorchDefs() {
  const { emberCx, emberCy, emberR, moundFrac, height } = SNUFFED
  return (
    <svg width="0" height="0" className="absolute" aria-hidden>
      <defs>
        <radialGradient id="torch-heart" cx="12" cy="14.5" r="7" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={PALE} />
          <stop offset=".4" stopColor="var(--color-gold-300)" />
          <stop offset=".8" stopColor="var(--color-gold-500)" />
          <stop offset="1" stopColor="#c27f2f" />
        </radialGradient>
        {/* Gradients for the traced drawing live in its pixel space. */}
        <linearGradient id="torch-smoke" x1="0" y1={height} x2="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={ASH_DARK} />
          <stop offset={moundFrac} stopColor={SMOKE} />
          <stop offset={moundFrac + 0.12} stopColor={SMOKE} />
          <stop offset=".65" stopColor="#8a7a66" stopOpacity=".65" />
          <stop offset="1" stopColor="#a89d8c" stopOpacity=".1" />
        </linearGradient>
        <radialGradient id="torch-ember" cx={emberCx} cy={emberCy} r={emberR * 1.15} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={PALE} />
          <stop offset=".45" stopColor="var(--color-gold-300)" />
          <stop offset="1" stopColor="var(--color-terracotta-600)" />
        </radialGradient>
      </defs>
    </svg>
  )
}

export function Torch({ lit, title }: { lit: boolean; title: string }) {
  return (
    <svg viewBox={VIEWBOX} className="size-4 shrink-0" aria-hidden>
      <title>{title}</title>
      {lit ? (
        <path d={FLAME_PATH} fill="url(#torch-heart)" />
      ) : (
        <g transform={PLACE}>
          <path d={SNUFFED.smoke} fill="url(#torch-smoke)" />
          <path d={SNUFFED.ember} fill="url(#torch-ember)" />
        </g>
      )}
    </svg>
  )
}
