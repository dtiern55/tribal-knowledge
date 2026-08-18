/** A small carved advantage idol for Double Roster Points. On the roster it
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
        <path
          data-part="idol"
          d="M13 2.5 19 7 24 1.5 29 7 35 2.5 34 10.5 42 14.5 38 22 43 27.5 36 32 35 45 29 42 24 50 19 42 13 45 12 32 5 27.5 10 22 6 14.5 14 10.5Z"
          fill="#d4913a"
          stroke="#1c1917"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path
          data-part="field"
          d="M15.5 8 20 11.5 24 7 28 11.5 32.5 8 31.5 13.5 37.5 16.5 34 22.5 38.5 27 32 29.5 31.5 39.5 27 37.5 24 43.5 21 37.5 16.5 39.5 16 29.5 9.5 27 14 22.5 10.5 16.5 16.5 13.5Z"
          fill="#1e3a2f"
        />

        {!compact && (
          <g data-part="carved-face">
            <path d="M15.5 15.5 24 10l8.5 5.5-2 4.5H17.5Z" fill="#c45432" />
            <path d="m16.5 20.5 6 1.4-4.6 3.8Z" fill="#f2e9db" />
            <path d="m31.5 20.5-6 1.4 4.6 3.8Z" fill="#f2e9db" />
            <path d="m24 18.5 2.2 8-2.2 2.2-2.2-2.2Z" fill="#d4913a" />
            <path
              d="M19 30.5c3.2 2 6.8 2 10 0"
              fill="none"
              stroke="#2e6b52"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        )}

        <text
          data-part={compact ? 'compact-mark' : 'multiplier'}
          x="24"
          y={compact ? 34 : 41}
          textAnchor="middle"
          fill="#f2e9db"
          fontFamily="Rajdhani, system-ui, sans-serif"
          fontSize={compact ? 23 : 15}
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
            <path d="m13 7 3.5 2.5M35 7l-3.5 2.5M8.5 16.5l4 1.5M39.5 16.5l-4 1.5" />
            <path d="m8.5 27.5 4 1M39.5 27.5l-4 1M15 39l3.5-1M33 39l-3.5-1" />
          </g>
        )}
      </svg>
    </span>
  )
}
