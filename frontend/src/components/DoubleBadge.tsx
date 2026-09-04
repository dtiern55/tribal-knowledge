import idolImg from '../assets/weekly-advantage-idol-dimensional.webp'

/** The carved skull idol for the weekly ×2 advantage. On the roster it's also
 *  the drag handle for moving the play. Sized in px via `size`; the ×2 seal is
 *  baked into the art so the multiplier reads at every size.
 *
 *  The art comes from the `--advantage-idol` CSS variable, which Layout sets
 *  on the document once it knows the active season, so the badge follows the
 *  season without every call site threading a prop. Portals inherit it too. */
export function DoubleBadge({
  size = 22,
  title = 'Double Castaway Points this episode',
}: {
  size?: number
  title?: string
}) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-flex shrink-0 select-none bg-contain bg-center bg-no-repeat drop-shadow-[0_1px_1px_rgb(28_25_23_/_0.25)]"
      style={{ height: size, width: size, backgroundImage: `var(--advantage-idol, url(${idolImg}))` }}
    />
  )
}
