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
 * lit while the contestant is in, snuffed once voted out. Voted-out cards go
 * muted ash.
 *
 * The SOLE SURVIVOR stamp is two-state: quiet and outlined while the pick is
 * still changeable, filling in gold once the designation locks. A permanently
 * gold stamp read as "active now" all season, when the pick is really a bet
 * that doesn't pay until the finale.
 */
export function RosterCard({
  contestantId,
  contestant,
  isSoleSurvivor = false,
  ssWindowOpen = false,
  swappedInEpisode = null,
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
  right?: ReactNode
  // Optional tap-to-expand per-episode breakdown (#257): when onToggle is
  // given, a chevron reveals `children` below the row.
  expanded?: boolean
  onToggle?: () => void
  children?: ReactNode
}) {
  const outEp = contestant?.eliminated_in_episode ?? null
  const ssTitle = 'Sole Survivor — finale points are worth an extra 50%'
  return (
    <li
      className={[
        'relative flex flex-col p-3 rounded-lg border',
        outEp != null ? 'bg-gray-50 border-gray-200' : 'bg-white border-sand-200',
        isSoleSurvivor ? (ssWindowOpen ? 'ring-2 ring-stone-200' : 'ring-2 ring-amber-400') : '',
      ].join(' ')}
    >
      {isSoleSurvivor && outEp == null && (
        <span
          className={`${STAMP_BASE} ${
            ssWindowOpen
              ? 'border-stone-300 bg-white text-stone-500'
              : 'border-amber-400 bg-amber-50 text-amber-700'
          }`}
          title={ssWindowOpen ? `${ssTitle} — changeable until the designation locks` : ssTitle}
        >
          Sole Survivor
        </span>
      )}
      {/* Tapping the row opens the breakdown — that's where your own scoring
          lives, including 2x roster points. The name and avatar stay a link to
          the contestant's own page; stopPropagation keeps it from also
          expanding. The chevron remains the keyboard/screen-reader control. */}
      <div
        className={`flex items-center justify-between ${onToggle ? 'cursor-pointer' : ''}`}
        onClick={onToggle}
      >
      <Link
        to={`/contestants/${contestantId}`}
        onClick={(e) => e.stopPropagation()}
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
          <span className="text-[11px] uppercase tracking-wide text-stone-400">ep {outEp}</span>
        )}
        {isSoleSurvivor && outEp != null && (
          <span
            className="text-[11px] uppercase tracking-widest text-amber-700 border border-amber-300 rounded px-2 py-1 font-semibold"
            title={ssTitle}
          >
            SS
          </span>
        )}
        {swappedInEpisode != null && (
          <span
            className="text-[11px] uppercase tracking-widest text-ocean-600 border border-ocean-200 rounded px-2 py-1"
            title={`Swapped in from episode ${swappedInEpisode}`}
          >
            ⇄ ep {swappedInEpisode}
          </span>
        )}
      </Link>
        <div className="flex items-center gap-2 shrink-0 ml-auto pl-2">
          {right}
          {onToggle && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              aria-expanded={expanded}
              aria-label="Toggle episode breakdown"
              className="-mr-1 p-1 text-gray-500 hover:text-gray-600"
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
