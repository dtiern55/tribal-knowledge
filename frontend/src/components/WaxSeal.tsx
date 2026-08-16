import { useId } from 'react'

/**
 * A red wax seal stamped with "×2" — the mark for a played Double Roster Points
 * (#397/#407). Advantages in Survivor arrive as sealed parchment, and My Season
 * is already an aged-paper record, so a played double reads as a seal pressed
 * onto the row rather than a warning chip.
 *
 * Drawn as SVG (turbulence for the organic wax edge and watercolor mottle) so
 * it stays crisp from the ~30px roster mark down to the ~16px beat-tab echo.
 * `detail="min"` drops the medallion rings and dots, which only muddy below
 * ~22px. Filter ids are scoped per instance so two seals can share a screen.
 */
export function WaxSeal({
  size = 30,
  detail = 'full',
  title = 'Double Roster Points this episode',
}: {
  size?: number
  detail?: 'full' | 'min'
  title?: string
}) {
  const uid = useId().replace(/:/g, '')
  const dots =
    detail === 'full'
      ? Array.from({ length: 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2
          return {
            cx: (50 + Math.cos(a) * 26.5).toFixed(2),
            cy: (50 + Math.sin(a) * 26.5).toFixed(2),
          }
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
        <filter id={`rough-${uid}`} x="-25%" y="-25%" width="150%" height="150%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.024 0.027"
            numOctaves="2"
            seed="11"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="4.5"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter id={`mottle-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="3" seed="4" result="t" />
          <feColorMatrix
            in="t"
            type="matrix"
            values="0 0 0 0 0.22  0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 0.55 0"
          />
          <feComposite operator="in" in2="SourceGraphic" />
        </filter>
        <radialGradient id={`fill-${uid}`} cx="40%" cy="33%" r="72%">
          <stop offset="0%" stopColor="#c8503a" />
          <stop offset="38%" stopColor="#a83122" />
          <stop offset="74%" stopColor="#851f13" />
          <stop offset="100%" stopColor="#57130a" />
        </radialGradient>
      </defs>

      <g transform="rotate(-8 50 50)">
        {/* wax body — edge roughened */}
        <g filter={`url(#rough-${uid})`}>
          <circle cx="50" cy="51" r="35" fill={`url(#fill-${uid})`} />
          <circle cx="50" cy="51" r="35" fill="none" stroke="#4a1109" strokeWidth="4" opacity="0.35" />
          <circle cx="50" cy="51" r="35" fill="#4a1109" filter={`url(#mottle-${uid})`} />
        </g>

        {/* pressed medallion — stays crisp */}
        {detail === 'full' && (
          <>
            <g fill="none" opacity="0.55">
              <circle cx="50" cy="50.2" r="29" stroke="#e6907a" strokeWidth="1.6" opacity="0.5" />
              <circle cx="50" cy="50.2" r="24" stroke="#e6907a" strokeWidth="1.2" opacity="0.5" />
              <circle cx="50" cy="50" r="29" stroke="#4a1109" strokeWidth="1.6" />
              <circle cx="50" cy="50" r="24" stroke="#4a1109" strokeWidth="1.1" />
            </g>
            {dots.map((d, i) => (
              <circle key={i} cx={d.cx} cy={d.cy} r="0.9" fill="#4a1109" opacity="0.5" />
            ))}
          </>
        )}

        {/* ×2, pressed (emboss highlight behind the ink) */}
        <text
          x="50"
          y="60.6"
          textAnchor="middle"
          fontFamily="'Arial Narrow','Helvetica Neue',sans-serif"
          fontWeight="700"
          fontSize={detail === 'full' ? 27 : 34}
          fill="#e6907a"
          opacity="0.5"
        >
          ×2
        </text>
        <text
          x="50"
          y="60"
          textAnchor="middle"
          fontFamily="'Arial Narrow','Helvetica Neue',sans-serif"
          fontWeight="700"
          fontSize={detail === 'full' ? 27 : 34}
          fill="#480f07"
        >
          ×2
        </text>
      </g>
    </svg>
  )
}
