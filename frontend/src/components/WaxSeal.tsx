import sealUrl from '../assets/wax-2x.png'

/**
 * A red wax seal stamped "2x" — the mark for a played Double Roster Points
 * (#397/#407). Advantages in Survivor arrive as sealed parchment, and My Season
 * is already an aged-paper record, so a played double reads as a seal pressed
 * onto the row rather than a warning chip.
 *
 * A pre-rendered watercolor illustration (Danny's), trimmed and sized down to a
 * 192px icon. Rendered at ~34px beside the doubled castaway and ~18px on its
 * beat-tab echo.
 */
export function WaxSeal({
  size = 34,
  title = 'Double Roster Points this episode',
}: {
  size?: number
  title?: string
}) {
  return (
    <img
      src={sealUrl}
      alt={title}
      width={size}
      height={size}
      style={{ display: 'block', flex: 'none' }}
    />
  )
}
