import type { CSSProperties } from 'react'

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
  tribeColor = null,
  rotation = 0,
}: {
  name: string
  stale?: boolean
  tribeColor?: string | null
  /** Supplied per slip and stable across renders, so the pile never reshuffles. */
  rotation?: number
}) {
  return (
    <span
      className={`ballot-slip ${stale ? 'ballot-slip--stale' : ''}`}
      style={
        {
          '--ballot-tribe-color': tribeColor ?? 'var(--color-gold-500)',
          '--ballot-rotation': `${rotation}deg`,
        } as CSSProperties
      }
    >
      <span className={stale ? 'line-through' : undefined}>{name}</span>
    </span>
  )
}
