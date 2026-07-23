import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Contestant } from '../types'
import { ContestantAvatar } from './ContestantAvatar'
import { Torch } from './Torch'

const STAMP_BASE =
  'absolute -top-2.5 -left-3 -rotate-6 rounded border-2 px-1.5 py-0.5 ' +
  'text-[9px] font-bold uppercase tracking-widest shadow-sm'

/**
 * Roster row card (#190, #56): a torch in the leading column carries status —
 * lit while the contestant is in, snuffed once voted out. A gold SOLE SURVIVOR
 * corner stamp marks the designee (plus a gold ring — light while the
 * designation window is open, solid once locked). Voted-out cards go muted ash.
 */
export function RosterCard({
  contestantId,
  contestant,
  isSoleSurvivor = false,
  ssWindowOpen = false,
  swappedInEpisode = null,
  doubledCount = 0,
  right,
  expanded = false,
  onToggle,
  children,
}: {
  contestantId: string
  contestant: Contestant | undefined
  isSoleSurvivor?: boolean
  ssWindowOpen?: boolean
  swappedInEpisode?: number | null
  doubledCount?: number
  right?: ReactNode
  // Optional tap-to-expand per-episode breakdown (#257): when onToggle is
  // given, a chevron reveals `children` below the row.
  expanded?: boolean
  onToggle?: () => void
  children?: ReactNode
}) {
  const outEp = contestant?.eliminated_in_episode ?? null
  const ssTitle = 'Sole Survivor — finale points count double'
  return (
    <li
      className={[
        'relative flex flex-col p-3 rounded-lg border',
        outEp != null ? 'bg-gray-50 border-gray-200' : 'bg-white border-sand-200',
        isSoleSurvivor ? (ssWindowOpen ? 'ring-2 ring-amber-200' : 'ring-2 ring-amber-400') : '',
      ].join(' ')}
    >
      {isSoleSurvivor && outEp == null && (
        <span
          className={`${STAMP_BASE} border-amber-400 bg-amber-50 text-amber-600`}
          title={ssTitle}
        >
          Sole Survivor
        </span>
      )}
      {doubledCount > 0 && (
        <span
          className={`${STAMP_BASE} left-auto -right-2 rotate-6 border-ocean-400 bg-ocean-50 text-ocean-600`}
          title={`Double Roster Points played ×${doubledCount} — points shown are doubled`}
        >
          ×{doubledCount} Doubled
        </span>
      )}
      <div className="flex items-center justify-between">
      <Link
        to={`/contestants/${contestantId}`}
        className={`flex items-center gap-2 font-medium hover:text-ocean-700 ${
          outEp != null ? 'text-gray-500' : 'text-gray-900'
        }`}
      >
        <span
          className="shrink-0"
          title={outEp != null ? `Voted out · episode ${outEp}` : 'Still in the game'}
        >
          <Torch lit={outEp == null} />
        </span>
        <span className={outEp != null ? 'grayscale opacity-70' : undefined}>
          <ContestantAvatar
            name={contestant?.name ?? '—'}
            imageUrl={contestant?.image_url ?? null}
            tribeColor={contestant?.tribe_color ?? null}
            tribeName={contestant?.tribe_name ?? null}
          />
        </span>
        <span className={outEp != null ? 'line-through decoration-stone-300' : undefined}>
          {contestant?.name ?? '—'}
        </span>
        {outEp != null && (
          <span className="text-[10px] uppercase tracking-wide text-stone-400">ep {outEp}</span>
        )}
        {isSoleSurvivor && outEp != null && (
          <span
            className="text-[10px] uppercase tracking-widest text-amber-600 border border-amber-300 rounded px-1.5 py-0.5 font-semibold"
            title={ssTitle}
          >
            SS
          </span>
        )}
        {swappedInEpisode != null && (
          <span
            className="text-[10px] uppercase tracking-widest text-ocean-600 border border-ocean-200 rounded px-1.5 py-0.5"
            title={`Swapped in from episode ${swappedInEpisode}`}
          >
            ⇄ ep {swappedInEpisode}
          </span>
        )}
      </Link>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          {onToggle && (
            <button
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label="Toggle episode breakdown"
              className="-mr-1 p-1 text-gray-400 hover:text-gray-600"
            >
              <svg
                viewBox="0 0 24 24"
                className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {onToggle && expanded && children && (
        <div className="mt-3 pt-3 border-t border-sand-100">{children}</div>
      )}
    </li>
  )
}
