import { useId } from 'react'

/** A tropical national-park patch for Double Roster Points. On the roster it
 * also remains the drag handle for moving the play. Detail steps down with the
 * rendered size so the mark stays legible in the 15px beat tab. */
export function DoubleBadge({
  size = 22,
  title = 'Double Roster Points this episode',
}: {
  size?: number
  title?: string
}) {
  const compact = size < 20
  const stitched = size >= 28
  const fieldId = `double-badge-field-${useId().replaceAll(':', '')}`

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-flex shrink-0 select-none items-center justify-center drop-shadow-[0_1px_1px_rgb(28_25_23_/_0.25)]"
      style={{
        height: size,
        width: Math.round(size * 0.94),
      }}
    >
      <svg
        viewBox="0 0 48 52"
        aria-hidden="true"
        data-mark="double-patch"
        data-detail={compact ? 'compact' : 'scene'}
        className="block h-full w-full overflow-visible"
      >
        <defs>
          <clipPath id={fieldId}>
            <path d="M24 5 41.5 12v15.5c0 8-6 14.2-17.5 18.8C12.5 41.7 6.5 35.5 6.5 27.5V12Z" />
          </clipPath>
        </defs>

        <path
          data-part="patch"
          d="M24 1.5 45 10v18c0 10-7.5 17.5-21 22.5C10.5 45.5 3 38 3 28V10Z"
          fill="#d4913a"
          stroke="#1c1917"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path
          data-part="field"
          d="M24 5 41.5 12v15.5c0 8-6 14.2-17.5 18.8C12.5 41.7 6.5 35.5 6.5 27.5V12Z"
          fill="#1e3a2f"
        />

        {compact && (
          <g data-part="compact-field" clipPath={`url(#${fieldId})`}>
            <path d="M6 9h36v13H6Z" fill="#c45432" />
          </g>
        )}

        {!compact && (
          <g data-part="tropical-scene" clipPath={`url(#${fieldId})`}>
            <path d="M6 9h36v16H6Z" fill="#c45432" />
            <circle cx="24" cy="20.5" r="6" fill="#d4913a" />
            <path d="M6 20.5h36v7H6Z" fill="#2e6b52" />
            <path d="M6 23h36v1.5H6Z" fill="#f2e9db" opacity="0.9" />

            <g
              data-part="palms"
              fill="none"
              stroke="#1e3a2f"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.5 27c0-6.5 1.8-11 5.5-14" />
              <path d="M16 13c-3.5-2.2-6.5-2-8.7-.2M16 13c-.8-3.4-3-5.2-5.7-5.8M16 13c1.1-3.2 3.4-4.7 6.2-4.7M16 13c3.4-1.5 6.1-.8 7.8 1" />
              <path d="M37.5 27c0-6.5-1.8-11-5.5-14" />
              <path d="M32 13c3.5-2.2 6.5-2 8.7-.2M32 13c.8-3.4 3-5.2 5.7-5.8M32 13c-1.1-3.2-3.4-4.7-6.2-4.7M32 13c-3.4-1.5-6.1-.8-7.8 1" />
            </g>
          </g>
        )}

        {!compact && <path d="M6.5 27.5h35" stroke="#d4913a" strokeWidth="2" />}
        <text
          data-part={compact ? 'compact-mark' : 'multiplier'}
          x="24"
          y={compact ? 35 : 42.5}
          textAnchor="middle"
          fill="#f2e9db"
          fontFamily="Rajdhani, system-ui, sans-serif"
          fontSize={compact ? 25 : 19}
          fontWeight="700"
          letterSpacing={compact ? '-1.4' : '-1'}
        >
          ×2
        </text>

        {stitched && (
          <path
            data-part="stitching"
            d="M24 3.5 43 11v17c0 9-6.8 15.8-19 20.5C11.8 43.8 5 37 5 28V11Z"
            fill="none"
            stroke="#f2e9db"
            strokeWidth="0.85"
            strokeDasharray="1.8 2.1"
            strokeLinecap="round"
            opacity="0.72"
          />
        )}
      </svg>
    </span>
  )
}
