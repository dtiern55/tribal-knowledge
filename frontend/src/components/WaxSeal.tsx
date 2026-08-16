import sealLarge from '../assets/wax-2x.png'
import sealSmall from '../assets/wax-2x-small.png'

/**
 * A red wax seal stamped "2x" — the mark for a played Double Roster Points
 * (#397/#407). Advantages in Survivor arrive as sealed parchment, and My Season
 * is already an aged-paper record, so a played double reads as a seal pressed
 * onto the row rather than a warning chip.
 *
 * Two pre-rendered illustrations (Danny's): a detailed one for the ~34px roster
 * mark, and a bolder, simpler one for the ~18px beat-tab echo where fine detail
 * would just muddy. `variant` picks between them.
 */
export function WaxSeal({
  size = 34,
  variant = 'large',
  title = 'Double Roster Points this episode',
}: {
  size?: number
  variant?: 'large' | 'small'
  title?: string
}) {
  return (
    <img
      src={variant === 'small' ? sealSmall : sealLarge}
      alt={title}
      width={size}
      height={size}
      style={{ display: 'block', flex: 'none' }}
    />
  )
}
