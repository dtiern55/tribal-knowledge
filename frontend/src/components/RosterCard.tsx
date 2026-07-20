import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Contestant } from '../types'
import { ContestantAvatar } from './ContestantAvatar'
import { Torch } from './Torch'

const STAMP_BASE =
  'absolute -top-2.5 -left-3 -rotate-6 rounded border-2 px-1.5 py-0.5 ' +
  'text-[9px] font-bold uppercase tracking-widest shadow-sm'

/**
 * Roster row card (#190): corner stamp hanging off the top-left edge — red
 * a snuffed-torch stamp for boots (wins the corner), gold SOLE SURVIVOR
 * otherwise — plus a gold outline for the designee (light while the
 * designation window is still open, solid once locked). Voted-out cards go
 * muted ash.
 */
export function RosterCard({
  contestantId,
  contestant,
  isSoleSurvivor = false,
  ssWindowOpen = false,
  swappedInEpisode = null,
  doubled = false,
  right,
}: {
  contestantId: string
  contestant: Contestant | undefined
  isSoleSurvivor?: boolean
  ssWindowOpen?: boolean
  swappedInEpisode?: number | null
  doubled?: boolean
  right?: ReactNode
}) {
  const outEp = contestant?.eliminated_in_episode ?? null
  const ssTitle = 'Sole Survivor — finale points count double'
  return (
    <li
      className={[
        'relative flex items-center justify-between p-3 rounded-lg border',
        outEp != null ? 'bg-gray-50 border-gray-200' : 'bg-white border-sand-200',
        isSoleSurvivor ? (ssWindowOpen ? 'ring-2 ring-amber-200' : 'ring-2 ring-amber-400') : '',
      ].join(' ')}
    >
      {outEp != null ? (
        <span
          className={`${STAMP_BASE} border-stone-300 bg-stone-50 text-stone-500 inline-flex items-center gap-1`}
          title={`Voted out · episode ${outEp}`}
        >
          <Torch lit={false} className="w-3.5 h-3.5" />
          Out · Ep {outEp}
        </span>
      ) : isSoleSurvivor ? (
        <span
          className={`${STAMP_BASE} border-amber-400 bg-amber-50 text-amber-600`}
          title={ssTitle}
        >
          Sole Survivor
        </span>
      ) : null}
      <Link
        to={`/contestants/${contestantId}`}
        className={`flex items-center gap-2 font-medium hover:text-ocean-700 ${
          outEp != null ? 'text-gray-500' : 'text-gray-900'
        }`}
      >
        <span className={outEp != null ? 'grayscale opacity-70' : undefined}>
          <ContestantAvatar name={contestant?.name ?? '—'} imageUrl={contestant?.image_url ?? null} />
        </span>
        <span className={outEp != null ? 'line-through decoration-stone-300' : undefined}>
          {contestant?.name ?? '—'}
        </span>
        {/* OUT wins the corner; keep the SS info as an inline chip. */}
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
        {doubled && <span className="text-ocean-600 font-semibold">×2</span>}
      </Link>
      {right}
    </li>
  )
}
