import idolNecklace from '../assets/sole-survivor-medallion-teeth-skull-flat-larger.png'

/**
 * The tusk-idol necklace worn by a designated Sole Survivor (#164 medallion).
 *
 * Drop this inside a `position: relative`, square parent that holds the round
 * portrait — it sits on top as an overlay. Sized and offset in % of that parent
 * (width 149%, +13% vertical) so it stays locked to the portrait at any size or
 * pixel density with no per-device math (width 195%, +8% vertical).
 * Decorative: the "Sole Survivor" meaning is carried by an adjacent label, so
 * this is aria-hidden.
 */
export function SoleSurvivorFrame() {
  return (
    <img
      src={idolNecklace}
      alt=""
      aria-hidden
      className="pointer-events-none absolute left-1/2"
      style={{
        top: 'calc(50% + 8%)',
        width: '195%',
        maxWidth: 'none',
        height: 'auto',
        transform: 'translate(-50%, -50%)',
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.28))',
      }}
    />
  )
}
