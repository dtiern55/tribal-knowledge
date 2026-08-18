/** A hand-carved driftwood talisman for Double Roster Points. On the roster it
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
        {!compact && (
          <g
            data-part="cord"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17-2c1.8 6 3.8 9.5 7.5 15.5M31-2c-1.2 6-3.2 9.5-6.5 15.5" stroke="#715c47" strokeWidth="3.5" />
            <path d="M17-2c1.8 6 3.8 9.5 7.5 15.5M31-2c-1.2 6-3.2 9.5-6.5 15.5" stroke="#d4913a" strokeWidth="1" strokeDasharray="1.8 1.6" />
          </g>
        )}

        <path
          data-part="idol"
          d="M23.5 5.5c7.8-.3 15 5.2 18 13.1 3.3 8.5 1 17.2-4.7 23.3-3.6 3.9-7.7 6.5-11 4.3-1.1-.7-1.5-1.9-2-3-1 2.9-3.6 5.5-6.7 4.5C8.8 45 4.2 36.2 5.8 27c1-5.7 3.6-11.1 7.4-15.4 3-3.5 6.4-5.9 10.3-6.1Z"
          fill="#b97928"
          stroke="#1c1917"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
        <path
          data-part="field"
          d="M23.7 8.5c6.7-.3 12.9 4.6 15.4 11.3 2.7 7.1.7 14.7-4 19.9-3.2 3.4-6.6 5.3-8.7 3.8-1.4-1-1.6-3.2-2.5-5-1.3 3.2-3.5 6.9-6.3 6-6.9-2.2-10.3-9.7-8.9-17.1.9-4.9 3.1-9.6 6.3-13.3 2.5-3.1 5.6-5.5 8.7-5.6Z"
          fill="#d4913a"
        />

        {!compact && (
          <>
            <circle cx="24" cy="13.5" r="4.25" fill="#715c47" stroke="#b97928" strokeWidth="1.2" />
            <circle data-part="cord-hole" cx="24" cy="13.5" r="2.15" fill="#1c1917" />
            <path
              data-part="carved-grooves"
              d="M11.5 23c.4-5.3 3.7-8.4 7.2-7.4 3.1.9 3.1 5.1.4 6.3-2.1 1-4-.5-2.9-2.1M33.2 14.8c4.5 3 6.2 7.6 5.2 12.3M10.4 34.8c3.2 1.1 6 .2 7.6-2.2M28.7 42.2c4.6-1.8 7.7-5 9.1-9.4"
              fill="none"
              stroke="#1e3a2f"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M34.8 16.8c2.5 2.6 3.6 5 3.8 7.5M11.5 39.3c2.1 2.5 4.6 3.7 7.2 3.8"
              fill="none"
              stroke="#c45432"
              strokeWidth="1.25"
              strokeLinecap="round"
            />
          </>
        )}

        <text
          data-part={compact ? 'compact-mark' : 'multiplier'}
          x="24"
          y={compact ? 35 : 36}
          textAnchor="middle"
          fill="#1e3a2f"
          fontFamily="Rajdhani, system-ui, sans-serif"
          fontSize={compact ? 22 : 19}
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
            strokeWidth="0.75"
            strokeLinecap="round"
            opacity="0.55"
          >
            <path d="m14 12 3 1.1M10 28l3-1M35 29l3-1.2M14 40l3-1.1M30 39l3.2-1.2" />
            <path d="M12.5 31c1.1 4.2 4 7.2 7.7 8.3M30.5 18c2.8 1.5 4.5 4 5 7.2" />
          </g>
        )}
      </svg>
    </span>
  )
}
