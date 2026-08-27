import ballotMask from '../assets/icon-ballot-mask.webp'

/**
 * A cast ballot: the parchment slip with a name scrawled across it, tilted a
 * degree off true — the same object the ballot panel is full of.
 *
 * Painted rather than drawn (#552): the outline and the scrawl are the same
 * two marks the line version had, thickened into brush strokes and shipped as
 * an alpha mask, so it carries the same weight as the Cast buffs and still
 * takes the colour of whatever it sits in.
 */
export function VoteMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-mark="ballot"
      className={`${className} inline-block`}
      style={{
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${ballotMask})`,
        maskImage: `url(${ballotMask})`,
        WebkitMaskSize: '100%',
        maskSize: '100%',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
      }}
    />
  )
}
