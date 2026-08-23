import idolImg from '../assets/weekly-advantage-idol-dimensional.png'

/** The carved skull idol for the weekly ×2 advantage. On the roster it's also
 *  the drag handle for moving the play. Sized in px via `size`; the ×2 seal is
 *  baked into the art so the multiplier reads at every size. */
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
      style={{ height: size, width: size }}
    >
      <img
        src={idolImg}
        alt=""
        aria-hidden
        className="block h-full w-full"
        style={{ maxWidth: 'none' }}
      />
    </span>
  )
}
