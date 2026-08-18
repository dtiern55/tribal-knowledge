/** A stitched field patch for Double Roster Points (#397/#407). On the roster
 * it also remains the drag handle for moving the play. */
export function DoubleBadge({
  size = 22,
  title = 'Double Roster Points this episode',
}: {
  size?: number
  title?: string
}) {
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
        viewBox="0 0 40 44"
        aria-hidden="true"
        data-mark="double-patch"
        className="block h-full w-full overflow-visible"
      >
        <path
          data-part="patch"
          d="M7 2h26a5 5 0 0 1 5 5v18.5c0 7-5.2 12-18 16.5C7.2 37.5 2 32.5 2 25.5V7a5 5 0 0 1 5-5Z"
          fill="#1e3a2f"
          stroke="#d4913a"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          data-part="stitching"
          d="M8 6h24a2 2 0 0 1 2 2v16.5c0 5-3.8 8.8-14 12.7C9.8 33.3 6 29.5 6 24.5V8a2 2 0 0 1 2-2Z"
          fill="none"
          stroke="#f2e9db"
          strokeWidth="1.15"
          strokeDasharray="2.4 2.1"
          strokeLinecap="round"
          opacity="0.78"
        />
        <text
          x="20"
          y="25"
          textAnchor="middle"
          fill="#f2e9db"
          fontFamily="Rajdhani, system-ui, sans-serif"
          fontSize="16"
          fontWeight="700"
        >
          2×
        </text>
      </svg>
    </span>
  )
}
