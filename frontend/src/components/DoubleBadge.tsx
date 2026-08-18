/** A carved pendant idol for Double Roster Points. On the roster it also
 * remains the drag handle for moving the play. Detail steps down with the
 * rendered size so the mark stays legible in the 15px beat tab. */
export function DoubleBadge({
  size = 22,
  title = 'Double Roster Points this episode',
}: {
  size?: number
  title?: string
}) {
  const compact = size < 20
  const carved = size >= 28

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-flex shrink-0 select-none items-center justify-center drop-shadow-[0_1px_1px_rgb(28_25_23_/_0.25)]"
      style={{
        height: size,
        width: Math.round(size * 0.92),
      }}
    >
      <svg
        viewBox="0 0 48 52"
        aria-hidden="true"
        data-mark="double-idol"
        data-detail={compact ? 'compact' : 'carved'}
        className="block h-full w-full overflow-visible"
      >
        {!compact && (
          <g
            data-part="cord"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15-2c3.5 5.5 5.8 9 9 16M33-2c-3.5 5.5-5.8 9-9 16" stroke="#c45432" strokeWidth="3.2" />
            <path d="M15-2c3.5 5.5 5.8 9 9 16M33-2c-3.5 5.5-5.8 9-9 16" stroke="#d4913a" strokeWidth="1.05" />
          </g>
        )}

        <path
          data-part="idol"
          d="M24 6.5c9-.3 17.2 6.1 20 15 2.5 8.5-1 18.5-8.5 24C28.2 51 18 51.2 10.5 45.3 3 39.4.8 29.4 4.2 20.7 7.7 11.9 15 6.8 24 6.5Z"
          fill="#d4913a"
          stroke="#1c1917"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path
          data-part="field"
          d="M24 9.8c7.7-.3 14.5 5.1 17 12.4 2.3 7.1-.7 15.6-7 20.4-6 4.7-14.7 4.8-21 .1-6.3-4.7-8.1-13.1-5.2-20.4C10.7 15 16.3 10.1 24 9.8Z"
          fill="#1e3a2f"
        />

        {!compact && (
          <>
            <circle cx="24" cy="14" r="4.4" fill="#c45432" stroke="#d4913a" strokeWidth="1.25" />
            <circle data-part="cord-hole" cx="24" cy="14" r="2.15" fill="#1c1917" />
            <path
              data-part="carved-grooves"
              d="M8.5 22c2-5 5-8 9.5-10M39.5 22c-2-5-5-8-9.5-10M7.5 28c3-4 7.5-4.5 10-1.2m-10 1.2c-.8 4 1 7 4.5 8m28.5-8c-3-4-7.5-4.5-10-1.2m10 1.2c.8 4-1 7-4.5 8M13 41c3-2.3 5.3-2.1 8 .7l3 3 3-3c2.7-2.8 5-3 8-.7"
              fill="none"
              stroke="#d4913a"
              strokeWidth="1.55"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        <text
          data-part={compact ? 'compact-mark' : 'multiplier'}
          x="24"
          y={compact ? 35 : 36.5}
          textAnchor="middle"
          fill="#f2e9db"
          fontFamily="Rajdhani, system-ui, sans-serif"
          fontSize={compact ? 22 : 18}
          fontWeight="700"
          letterSpacing={compact ? '-1.3' : '-0.8'}
        >
          ×2
        </text>

        {carved && (
          <g
            data-part="carved-notches"
            fill="none"
            stroke="#f2e9db"
            strokeWidth="0.9"
            strokeLinecap="round"
            opacity="0.68"
          >
            <path d="m11 17 3.5 2-2.8 3M37 17l-3.5 2 2.8 3M7.5 32l4-1.5 1.2 3.5M40.5 32l-4-1.5-1.2 3.5" />
            <path d="m15 45 3-2M33 45l-3-2" />
          </g>
        )}
      </svg>
    </span>
  )
}
