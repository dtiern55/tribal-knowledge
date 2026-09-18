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

/** The idol stamped on the top-right corner of whatever the weekly play landed
 *  on (#849): a portrait for Double Castaway Points, a ballot chip, slip or
 *  portrait for a Power Vote. The parent must be `relative`. Sized at about
 *  62% of a portrait; the ring cut around it is `.advantage-stamp` in CSS so
 *  it follows the surface, night theme included. */
export function AdvantageStamp({ size, title, dark = false }: { size: number; title: string; dark?: boolean }) {
  return (
    <span
      className={`advantage-stamp ${dark ? 'advantage-stamp--dark' : ''} pointer-events-none absolute z-10 flex -rotate-[8deg] rounded-full`}
      style={{ top: -size * 0.28, right: -size * 0.32 }}
    >
      <DoubleBadge size={size} title={title} />
    </span>
  )
}
