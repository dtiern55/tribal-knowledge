import type { CSSProperties, ReactNode } from 'react'

/**
 * One submitted vote, treated like a handwritten Tribal Council slip.
 *
 * Outlined rather than filled (#552): a solid forest chip with the castaway's
 * portrait set into it read as a roster row, and the roster is where you look
 * at people — the ballot is where you write a name down. Drawn as an outline
 * the slip reads as a mark on the page instead of an object on it, and the
 * tribe still rides the left edge.
 */
export function VoteSlip({
  name,
  stale = false,
  doubled = false,
  tribeColor = null,
  rotation = 0,
  leading,
}: {
  name: string
  stale?: boolean
  /** The vote wearing the Power Vote (#673): gold, so it reads at a glance. */
  doubled?: boolean
  tribeColor?: string | null
  /** Supplied per slip and stable across renders, so the pile never reshuffles. */
  rotation?: number
  /** Content on the slip before the name: the ×2 idol on a doubled vote. */
  leading?: ReactNode
}) {
  return (
    <span
      className={`ballot-slip ${stale ? 'ballot-slip--stale' : ''} ${doubled ? 'ballot-slip--doubled' : ''}`}
      style={
        {
          '--ballot-tribe-color': tribeColor ?? 'var(--color-gold-500)',
          '--ballot-rotation': `${rotation}deg`,
        } as CSSProperties
      }
    >
      {leading}
      <span className={stale ? 'line-through' : undefined}>{name}</span>
    </span>
  )
}
