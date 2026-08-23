import featherIdol from '../assets/sole-survivor-medallion-feathers-brush.png'

/**
 * The feather-idol ring worn by a designated Sole Survivor (#164 medallion).
 *
 * Drop this inside a `position: relative`, square parent that holds the round
 * portrait — it sits on top as an overlay. Everything is expressed in % of that
 * parent (width 168%, offset −3% / +19%), so the ring stays locked to the
 * portrait at any size or pixel density with no per-device math. Decorative:
 * the "Sole Survivor" meaning is carried by an adjacent label, so this is
 * aria-hidden.
 */
export function SoleSurvivorFrame() {
  return (
    <img
      src={featherIdol}
      alt=""
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: 'calc(50% - 3%)',
        top: 'calc(50% + 19%)',
        width: '168%',
        maxWidth: 'none',
        height: 'auto',
        transform: 'translate(-50%, -50%)',
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.28))',
      }}
    />
  )
}
