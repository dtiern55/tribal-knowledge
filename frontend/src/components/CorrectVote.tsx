import type { ReactNode } from 'react'

/**
 * A correct elimination vote — the player predicted the boot right.
 *
 * Shared by My Season and the Team page. The jade fill is the whole signal:
 * the check coin it used to carry read as louder than the ×2 idol, which is
 * the one mark a vote can wear.
 *
 * Colours are night-safe: translucent/saturated jade over the record-paper
 * card, not `bg-jade-50`, which the locked-night theme repaints dark.
 */
export function CorrectVote({
  name,
  points,
  icon,
}: {
  name: ReactNode
  /** Points this correct vote earned, shown as a `+N` chip when non-zero. */
  points?: number | null
  /** The ×2 idol on a doubled vote that hit; leads the name. */
  icon?: ReactNode
}) {
  return (
    <span className="relative inline-flex items-center gap-1.5 rounded-md border border-jade-600/30 bg-jade-600/10 px-2 py-1 text-sm text-jade-800">
      {icon}
      <span className="sr-only">Correct — </span>
      {name}
      {points != null && points !== 0 && (
        <span className="text-xs font-semibold text-jade-700">+{points}</span>
      )}
    </span>
  )
}
