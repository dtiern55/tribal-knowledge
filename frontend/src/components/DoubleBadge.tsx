/**
 * The mark for a played Double Roster Points advantage (#397/#407): a clean
 * "2×" chip in the app's ocean action colour, matching the ballot's own ×2
 * note. On the roster it doubles as the drag handle for moving the double
 * (#407) — it's a plain element, so the drag wiring is unchanged.
 */
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
      className="inline-flex select-none items-center justify-center rounded-full bg-forest-600 font-bold leading-none text-white ring-1 ring-forest-800/25"
      style={{
        height: size,
        minWidth: size,
        padding: `0 ${Math.round(size * 0.26)}px`,
        fontSize: Math.round(size * 0.52),
      }}
    >
      2×
    </span>
  )
}
