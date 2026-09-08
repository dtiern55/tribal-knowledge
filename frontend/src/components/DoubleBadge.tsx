import defaultIcon from '../assets/default-advantage-icon.webp'

/** The season's idol for the weekly advantage play. Sized in px via `size`.
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
      style={{ height: size, width: size, backgroundImage: `var(--advantage-idol, url(${defaultIcon}))` }}
    />
  )
}
