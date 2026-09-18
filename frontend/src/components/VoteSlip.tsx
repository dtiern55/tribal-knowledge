import type { CSSProperties } from 'react'
import { AdvantageStamp } from './DoubleBadge'

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
  dark = false,
  tribeColor = null,
  rotation = 0,
}: {
  name: string
  stale?: boolean
  /** The vote wearing the Power Vote (#673): the idol stamps its corner (#849). */
  doubled?: boolean
  /** On a dark surface (the recap card) the app's locked-night slip colors
   *  aren't in play, so carry them here instead of reading forest-on-forest. */
  dark?: boolean
  tribeColor?: string | null
  /** Supplied per slip and stable across renders, so the pile never reshuffles. */
  rotation?: number
}) {
  return (
    <span
      className={`ballot-slip relative ${dark ? 'ballot-slip--dark' : ''} ${stale ? 'ballot-slip--stale' : ''}`}
      style={
        {
          '--ballot-tribe-color': tribeColor ?? 'var(--color-gold-500)',
          '--ballot-rotation': `${rotation}deg`,
        } as CSSProperties
      }
    >
      <span className={stale ? 'line-through' : undefined}>{name}</span>
      {doubled && <AdvantageStamp size={18} title="Power Vote" dark={dark} />}
    </span>
  )
}
