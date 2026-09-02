import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { QUOTES } from '../lib/quotes'

/**
 * Loading screen: a Survivor 8-tile sliding puzzle built from the Snakes and
 * Rats mark. Tiles clack around a beveled tray forever and never solve. Ported
 * faithfully from the design handoff — geometry, timing, and easing are final.
 *
 * `theme` follows the app's open/locked state (PageLoader reads `locked-night`
 * off <html>). Motion is timer-driven and paused under reduced-motion, which
 * leaves the board sitting in its scramble — still a legible "loading" state.
 */

type Theme = 'unlocked' | 'locked'

const CELL = 120
const GAP = 4
const SOLVED = [0, 1, 2, 3, 4, 5, 6, 7, null]
const INITIAL = [1, 4, 2, 7, null, 5, 0, 6, 3]

// Keycap bevels + the recessed well — identical in both themes (the frame and
// tile art are what change).
const BOARD = {
  shadow: 'radial-gradient(ellipse at center, rgba(18,34,26,0.42), transparent 70%)',
  well: 'linear-gradient(158deg, #0d1c15, #0a1610)',
  wellShadow: 'inset 0 4px 12px rgba(0,0,0,0.6), inset 0 -2px 0 rgba(255,255,255,0.03)',
  rest: 'inset 0 2px 0 rgba(255,255,255,0.10), inset 0 -4px 8px rgba(0,0,0,0.32), 0 5px 0 #0f2018, 0 7px 9px rgba(0,0,0,0.36)',
  lift: 'inset 0 2px 0 rgba(255,255,255,0.14), inset 0 -4px 8px rgba(0,0,0,0.32), 0 8px 0 #0f2018, 0 16px 22px rgba(0,0,0,0.46)',
}

const THEMES: Record<Theme, { scene: string; tileImg: string; label: string; frame: string; frameShadow: string }> = {
  unlocked: {
    // Match the .app-shell ground gradient (index.css) so the loader blends
    // into the sand page instead of reading as a white panel over it.
    scene: 'radial-gradient(circle at 100% 0%, rgba(196,84,50,0.08), transparent 62vw), linear-gradient(180deg, #f2e7d2, #e9dcc3)',
    tileImg: 'url("/puzzle-flat-dark.webp?v=20260902-tone")',
    label: '#1e3a2f',
    frame: 'linear-gradient(158deg, #23503d, #122318)',
    frameShadow: 'inset 0 3px 0 rgba(255,255,255,0.06), inset 0 -8px 16px rgba(0,0,0,0.5), 0 34px 44px -12px rgba(20,40,30,0.55)',
  },
  locked: {
    scene: 'radial-gradient(circle at 78% 8%, rgba(196,84,50,0.18), transparent 520px), linear-gradient(180deg, #132e25, #0e1f19)',
    tileImg: 'url("/puzzle-flat-light.webp?v=20260902-tone")',
    label: '#f2e9db',
    frame: 'linear-gradient(158deg, #d7c49d, #b89d70)',
    frameShadow: 'inset 0 3px 0 rgba(255,244,218,0.22), inset 0 -8px 16px rgba(92,65,38,0.34), 0 34px 48px -12px rgba(0,0,0,0.55)',
  },
}

function neighbors(i: number): number[] {
  const r = Math.floor(i / 3)
  const c = i % 3
  const out: number[] = []
  if (r > 0) out.push(i - 3)
  if (r < 2) out.push(i + 3)
  if (c > 0) out.push(i - 1)
  if (c < 2) out.push(i + 1)
  return out
}

const eq = (a: (number | null)[], b: (number | null)[]) => a.every((v, i) => v === b[i])

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function SlidePuzzleLoader({
  theme = 'unlocked',
  tempo = 0.8,
  doubleChance = 0.32,
  liftTiles = true,
  showLabel = true,
  label = 'Loading',
  tileSrc,
}: {
  theme?: Theme
  tempo?: number
  doubleChance?: number
  liftTiles?: boolean
  showLabel?: boolean
  label?: string
  // Override the theme's puzzle art (admin preview compares the old mark against
  // the new one). A bare public path; falls back to the theme default.
  tileSrc?: string
}) {
  const [grid, setGrid] = useState<(number | null)[]>(INITIAL)
  const [movingId, setMovingId] = useState<number | null>(null)
  // Pick once per mount so grid re-renders don't reshuffle the quote.
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)])

  useEffect(() => {
    if (prefersReducedMotion()) return // leave the board in its scramble

    // Algorithm state lives in refs so the timer chain reads the latest grid
    // without restarting the effect (a faithful port of the handoff's class).
    const g = INITIAL.slice()
    let prevEmpty = -1
    let stepTimer: ReturnType<typeof setTimeout>
    let liftTimer: ReturnType<typeof setTimeout>

    const baseDelay = () => (200 + Math.random() * 430) / tempo
    const scheduleNext = (d?: number) => {
      clearTimeout(stepTimer)
      stepTimer = setTimeout(doMove, d == null ? baseDelay() : d)
    }

    function doMove() {
      const empty = g.indexOf(null)
      let opts = neighbors(empty)
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[opts[i], opts[j]] = [opts[j], opts[i]]
      }
      // 70% of the time, don't immediately reverse the last move.
      const nonReverse = opts.filter((n) => n !== prevEmpty)
      if (nonReverse.length && Math.random() < 0.7) {
        opts = nonReverse.concat(opts.filter((n) => n === prevEmpty))
      }
      let chosen: number | null = null
      for (const n of opts) {
        const test = g.slice()
        test[empty] = g[n]
        test[n] = null
        if (!eq(test, SOLVED)) {
          chosen = n
          break
        }
      }
      if (chosen == null) {
        scheduleNext()
        return
      }
      const tileId = g[chosen]
      g[empty] = tileId
      g[chosen] = null
      prevEmpty = empty
      setGrid(g.slice())
      setMovingId(tileId)
      clearTimeout(liftTimer)
      liftTimer = setTimeout(() => setMovingId(null), 210)

      const dbl = Math.random() < doubleChance
      scheduleNext(dbl ? 135 / tempo : baseDelay())
    }

    scheduleNext(500)
    return () => {
      clearTimeout(stepTimer)
      clearTimeout(liftTimer)
    }
  }, [tempo, doubleChance])

  const TH = THEMES[theme]

  const sceneStyle: CSSProperties = {
    minHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '54px',
    backgroundImage: TH.scene,
    fontFamily: 'var(--font-display, "Rajdhani", system-ui, sans-serif)',
  }

  return (
    <div style={sceneStyle} role="status" aria-live="polite" aria-label={label}>
      <div className="slide-puzzle-scale" style={{ perspective: '1600px' }}>
        <div
          style={{
            position: 'relative',
            transform: 'rotateX(15deg) rotateZ(-6deg) rotateY(-3deg)',
            transformStyle: 'flat',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '50%',
              top: '86%',
              width: '300px',
              height: '70px',
              transform: 'translate(-50%, 0)',
              background: BOARD.shadow,
              filter: 'blur(10px)',
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              padding: '16px',
              borderRadius: '28px',
              background: TH.frame,
              boxShadow: TH.frameShadow,
            }}
          >
            <div
              style={{
                position: 'relative',
                width: '360px',
                height: '360px',
                borderRadius: '16px',
                background: BOARD.well,
                boxShadow: BOARD.wellShadow,
              }}
            >
              {Array.from({ length: 8 }, (_, id) => {
                const gi = grid.indexOf(id)
                const r = Math.floor(gi / 3)
                const c = gi % 3
                const hr = Math.floor(id / 3)
                const hc = id % 3
                const moving = id === movingId
                const tileStyle: CSSProperties = {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '112px',
                  height: '112px',
                  borderRadius: '11px',
                  overflow: 'hidden',
                  backgroundImage: tileSrc ? `url("${tileSrc}")` : TH.tileImg,
                  backgroundSize: '384px 384px',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: `${-((hc + 0.5) * 128 - 56)}px ${-((hr + 0.5) * 128 - 56)}px`,
                  transition: 'transform 0.2s cubic-bezier(.34,1.45,.5,1), box-shadow 0.2s ease',
                  willChange: 'transform, box-shadow',
                  transform: `translate(${c * CELL + GAP}px, ${r * CELL + GAP}px)`,
                  zIndex: moving ? 6 : 1,
                  boxShadow: moving && liftTiles ? BOARD.lift : BOARD.rest,
                }
                return <div key={id} aria-hidden="true" style={tileStyle} />
              })}
            </div>
          </div>
        </div>
      </div>

      {showLabel && (
        <figure
          style={{
            margin: 0,
            maxWidth: 'min(90vw, 480px)',
            textAlign: 'center',
            color: TH.label,
          }}
        >
          <blockquote
            style={{
              margin: 0,
              fontFamily: 'var(--font-body, system-ui, sans-serif)',
              fontStyle: 'italic',
              fontSize: '19px',
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            {quote.text}
          </blockquote>
          <figcaption
            style={{
              marginTop: '14px',
              fontSize: '13px',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ color: '#c45432' }}>— </span>
            <span style={{ fontWeight: 600 }}>{quote.who}</span>
            {quote.season && <span style={{ opacity: 0.65 }}> · {quote.season}</span>}
            <span className="tk-dot" style={{ color: '#c45432', marginLeft: '2px' }}>.</span>
            <span className="tk-dot" style={{ color: '#c45432', animationDelay: '0.2s' }}>.</span>
            <span className="tk-dot" style={{ color: '#c45432', animationDelay: '0.4s' }}>.</span>
          </figcaption>
        </figure>
      )}
    </div>
  )
}
