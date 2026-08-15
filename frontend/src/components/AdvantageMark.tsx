import { ContestantAvatar } from './ContestantAvatar'
import type { Contestant } from '../types'

/**
 * The voting urn, with the double chalked onto it.
 *
 * Drawn rather than iconified: this is the one place the Ballot double is
 * shown, and the urn is what a vote actually goes into. Carved silhouette to
 * match the torch and buff marks (#378) — a lipped mouth, a bellied body, and
 * a slot cut in the top.
 */
export function UrnMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <path
        d="M9 11h22l-2 3H11z"
        fill="#7d5a33"
        stroke="#4d3620"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M11 14h18l-1.5 15a4 4 0 0 1-4 3.5h-7a4 4 0 0 1-4-3.5z"
        fill="#8a6539"
        stroke="#4d3620"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <rect x="16" y="8.5" width="8" height="2.2" rx="1" fill="#33240f" />
      <text
        x="20"
        y="28"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontSize="15"
        fill="#17100a"
        opacity="0.9"
      >
        ×2
      </text>
    </svg>
  )
}

/**
 * What you actually played, stamped on the button you played it with (#398).
 *
 * Sits in the corner the way the Sole Survivor stamp sits on a roster card,
 * so the button keeps naming itself while showing the specific play — this
 * castaway, doubled — rather than a separate confirmation row.
 */
export function AdvantageMark({
  contestant,
}: {
  /** Given for the roster double; omitted for the ballot double. */
  contestant?: Contestant
}) {
  // Inside the button's right edge rather than over its middle: the mark says
  // which play this is, the label still says what it is. The button reserves
  // room for it with padding, so neither ever sits on the other.
  const place = 'pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2'
  if (!contestant) {
    return (
      <span className={`${place} drop-shadow-sm`}>
        <UrnMark />
      </span>
    )
  }
  return (
    <span className={`${place} inline-flex drop-shadow-sm`}>
      <ContestantAvatar
        name={contestant.name}
        imageUrl={contestant.image_url}
        size="sm"
        tribeColor={contestant.tribe_color}
        tribeName={contestant.tribe_name}
      />
      <span className="-ml-1.5 -mb-1 self-end rounded-full border border-jungle-800 bg-jungle-600 px-1 text-[9px] font-extrabold leading-[1.35] text-white">
        ×2
      </span>
    </span>
  )
}
