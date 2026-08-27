import type { CSSProperties } from 'react'

/**
 * One submitted vote, as the thing you actually drop in the urn: a torn slip
 * of paper with a name written across it (#552).
 *
 * It used to be a dark green chip with the castaway's portrait set into it,
 * which read as a roster row rather than a vote — the roster is where you look
 * at people, the ballot is where you write a name down. The portrait is gone
 * and the tribe survives as a pip, which is all the ballot ever needed it for.
 *
 * The paper is a step warmer than the card it sits on, or a cream slip on a
 * cream plaque has no edge to find.
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
      <span className="ballot-slip__pip" aria-hidden="true" />
      <span className={stale ? 'line-through' : undefined}>{name}</span>
    </span>
  )
}
