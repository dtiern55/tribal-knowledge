import { useId } from 'react'

/**
 * A red wax seal stamped with "×2" — the mark for a played Double Roster Points
 * (#397/#407). Advantages in Survivor arrive as sealed parchment, and My Season
 * is already an aged-paper record, so a played double reads as a seal pressed
 * onto the row rather than a warning chip.
 *
 * Drawn as SVG so it stays crisp from the ~34px roster mark down to the ~18px
 * beat-tab echo. The wax edge and the watercolor mottle come from turbulence;
 * the ×2 and the medallion rings are *embossed light* (a light raised face over
 * a dark seat) so the glyph reads against the wax the way a real pressed seal
 * does. `detail="min"` drops the rings and dots, which only muddy below ~24px,
 * and lets the ×2 grow to fill the seal. Filter ids are scoped per instance so
 * the card seal and its tab echo can share a screen.
 */
export function WaxSeal({
  size = 34,
  detail = 'full',
  title = 'Double Roster Points this episode',
}: {
  size?: number
  detail?: 'full' | 'min'
  title?: string
}) {
  const uid = useId().replace(/:/g, '')
  const full = detail === 'full'
  const glyph = full ? 33 : 42
  const dots = full
    ? Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2
        return { x: 50 + Math.cos(a) * 27.4, y: 50 + Math.sin(a) * 27.4 }
      })
    : []

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      style={{ display: 'block', flex: 'none' }}
    >
      <title>{title}</title>
      <defs>
        <filter id={`rough-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.022"
            numOctaves="3"
            seed="17"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="6.5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter id={`mottle-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.14" numOctaves="3" seed="6" result="t" />
          <feColorMatrix
            in="t"
            type="matrix"
            values="0 0 0 0 0.55  0 0 0 0 0.15  0 0 0 0 0.09  0 0 0 0.35 0"
          />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
        <radialGradient id={`fill-${uid}`} cx="41%" cy="31%" r="78%">
          <stop offset="0%" stopColor="#f2856c" />
          <stop offset="30%" stopColor="#e2543a" />
          <stop offset="66%" stopColor="#cb3b25" />
          <stop offset="100%" stopColor="#9c2814" />
        </radialGradient>
        <radialGradient id={`bloom-${uid}`} cx="34%" cy="26%" r="42%">
          <stop offset="0%" stopColor="#fbc0ad" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fbc0ad" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g transform="rotate(-8 50 50)">
        {/* wax body — edge roughened, painterly bloom + mottle */}
        <g filter={`url(#rough-${uid})`}>
          <circle cx="50" cy="51" r="37" fill={`url(#fill-${uid})`} />
          <circle cx="50" cy="51" r="37" fill={`url(#bloom-${uid})`} />
          <circle cx="50" cy="51" r="37" fill="#8f2412" filter={`url(#mottle-${uid})`} />
          <circle cx="50" cy="51" r="37" fill="none" stroke="#8a2312" strokeWidth="3.5" opacity="0.28" />
        </g>

        {/* pressed medallion — light raised rings over a dark seat */}
        {full && (
          <>
            <g fill="none">
              <circle cx="50" cy="50.9" r="30" stroke="#7a1c0d" strokeWidth="2.2" opacity="0.42" />
              <circle cx="50" cy="50" r="30" stroke="#f9ddd0" strokeWidth="1.7" opacity="0.8" />
              <circle cx="50" cy="50.8" r="25" stroke="#7a1c0d" strokeWidth="1.6" opacity="0.4" />
              <circle cx="50" cy="50" r="25" stroke="#f9ddd0" strokeWidth="1.2" opacity="0.72" />
            </g>
            {dots.map((d, i) => (
              <g key={i}>
                <circle cx={d.x.toFixed(2)} cy={(d.y + 0.6).toFixed(2)} r="0.95" fill="#7a1c0d" opacity="0.4" />
                <circle cx={d.x.toFixed(2)} cy={d.y.toFixed(2)} r="0.95" fill="#f9ddd0" opacity="0.72" />
              </g>
            ))}
          </>
        )}

        {/* ×2 — embossed: dark seat, light raised face */}
        <text
          x="50.5"
          y="61.1"
          textAnchor="middle"
          fontFamily="'Arial Narrow','Helvetica Neue',sans-serif"
          fontWeight="700"
          fontSize={glyph}
          fill="#791a0b"
          opacity="0.75"
        >
          ×2
        </text>
        <text
          x="50"
          y="60.2"
          textAnchor="middle"
          fontFamily="'Arial Narrow','Helvetica Neue',sans-serif"
          fontWeight="700"
          fontSize={glyph}
          fill="#fbe3d8"
        >
          ×2
        </text>
      </g>
    </svg>
  )
}
