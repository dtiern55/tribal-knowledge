import type { ReactNode } from 'react'

/**
 * A correct elimination vote — the player predicted the boot right.
 *
 * Shared by My Season and the Team page, replacing the hand-written `✓ name`
 * jade pills each used to render separately. The check is a white tick in a
 * filled jade coin rather than the `✓` character.
 *
 * Colours are night-safe: translucent/saturated jade over the record-paper
 * card, not `bg-jade-50`, which the locked-night theme repaints dark.
 */
export function CorrectVote({
  name,
  points,
  trailing,
}: {
  name: ReactNode
  /** Points this correct vote earned, shown as a `+N` chip when non-zero. */
  points?: number | null
  /** Extra content inside the pill after the name (e.g. a ×2 marker). */
  trailing?: ReactNode
}) {
  return (
    <span className="relative inline-flex items-center gap-1.5 rounded-md border border-jade-600/30 bg-jade-600/10 px-2 py-1 text-sm text-jade-800">
      <span className="flex size-5 items-center justify-center rounded-full bg-jade-600 text-white">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3"
          aria-hidden="true"
        >
          <path d="m3 8.5 3 3 7-8" />
        </svg>
      </span>
      <span className="sr-only">Correct — </span>
      {name}
      {points != null && points !== 0 && (
        <span className="text-xs font-semibold text-jade-700">+{points}</span>
      )}
      {trailing}
    </span>
  )
}
