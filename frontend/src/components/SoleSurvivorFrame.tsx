import idolRing from '../assets/sole-survivor-medallion-style-painted-no-pendant.png'

/**
 * The woven idol ring worn by a designated Sole Survivor (#164 medallion).
 *
 * Drop this inside a `position: relative`, square parent that holds the round
 * portrait — it sits on top as an overlay. The ring is symmetric, so it's
 * centered and sized in % of the parent (width 140%), which keeps it locked to
 * the portrait at any size or pixel density with no per-device math.
 * Decorative: the "Sole Survivor" meaning is carried by an adjacent label, so
 * this is aria-hidden.
 */
export function SoleSurvivorFrame() {
  return (
    <img
      src={idolRing}
      alt=""
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2"
      style={{
        width: '140%',
        maxWidth: 'none',
        height: 'auto',
        transform: 'translate(-50%, -50%)',
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.28))',
      }}
    />
  )
}
