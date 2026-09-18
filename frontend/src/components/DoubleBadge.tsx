import defaultIcon from '../assets/default-advantage-icon.webp'

/** The season's idol for the weekly advantage play. Sized in px via `size`.
 *
 *  The art comes from the `--advantage-idol` CSS variable, which Layout sets
 *  on the document once it knows the active season, so the badge follows the
 *  season without every call site threading a prop. Portals inherit it too. */
export function DoubleBadge({
  size = 22,
  title = 'Double Castaway Points this episode',
  stamp = false,
}: {
  size?: number
  title?: string
  /** The season's flat stamp art (`--advantage-stamp`) instead of the full idol. */
  stamp?: boolean
}) {
  const idol = `var(--advantage-idol, url(${defaultIcon}))`
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-flex shrink-0 select-none bg-contain bg-center bg-no-repeat drop-shadow-[0_1px_1px_rgb(28_25_23_/_0.25)]"
      style={{ height: size, width: size, backgroundImage: stamp ? `var(--advantage-stamp, ${idol})` : idol }}
    />
  )
}

/** The idol stamped on the top-right corner of whatever the weekly play landed
 *  on (#849): a portrait for Double Castaway Points, a ballot chip, slip or
 *  portrait for a Power Vote. The parent must be `relative`. Sized at about
 *  62% of a portrait. No cut-out ring: the art's own dark rim and the badge's
 *  shadow separate it, and a ring sat off the coin's edge as a pale halo. */
export function AdvantageStamp({ size, title }: { size: number; title: string }) {
  return (
    <span
      className="pointer-events-none absolute z-10 flex -rotate-[8deg]"
      style={{ top: -size * 0.28, right: -size * 0.32 }}
    >
      {/* The flat stamp art only where the full idol turns to mush: the 15-18 px
          stamps on the Field, recap, Standings and ballot chips. The 22-26 px
          ones on My Season and the ballot rail have room for the real idol. */}
      <DoubleBadge size={size} title={title} stamp={size <= 18} />
    </span>
  )
}
