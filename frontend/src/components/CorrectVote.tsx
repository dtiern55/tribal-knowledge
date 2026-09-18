import type { ReactNode } from 'react'
import { AdvantageStamp } from './DoubleBadge'

/**
 * A correct elimination vote — the player predicted the boot right.
 *
 * Shared by My Season and the Team page. The jade fill is the whole signal:
 * the check coin it used to carry read as louder than the idol stamped on a
 * Power Vote's corner, which is the one mark a vote can wear (#849).
 *
 * Colours are night-safe: translucent/saturated jade over the record-paper
 * card, not `bg-jade-50`, which the locked-night theme repaints dark.
 */
export function CorrectVote({
  name,
  points,
  power = false,
}: {
  name: ReactNode
  /** Points this correct vote earned, shown as a `+N` chip when non-zero. */
  points?: number | null
  /** The Power Vote rode this vote: the idol stamps its corner. */
  power?: boolean
}) {
  return (
    <span className="relative inline-flex items-center gap-1.5 rounded-md border border-jade-600/50 bg-jade-600/20 px-2 py-1 text-sm font-medium text-jade-800">
      <span className="sr-only">Correct — </span>
      {name}
      {points != null && points !== 0 && (
        <span className="text-xs font-semibold text-jade-700">+{points}</span>
      )}
      {power && <AdvantageStamp size={16} title="Power Vote" />}
    </span>
  )
}
