import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Contestant } from '../types'
import { ContestantAvatar } from './ContestantAvatar'

/**
 * One line in the roster manifest (#380 follow-on).
 *
 * The roster used to be five detached white cards floating on the page, which
 * never read as a set you own. It is now a record: aged paper, a ruled column
 * per entry, the castaway's photograph affixed beside a name printed in the
 * display face, and their points as a tally on the right. A boot is struck
 * through in place rather than removed — you cross a name out of a record, you
 * don't erase it.
 *
 * Wrap a list of these in `RosterManifest`, which supplies the paper and the
 * column header.
 */
export function RosterCard({
  contestantId,
  contestant,
  isSoleSurvivor = false,
  isDoubled = false,
  ssWindowOpen = false,
  swappedInEpisode = null,
  right,
  linkSuffix = '',
  expanded = false,
  onToggle,
  children,
}: {
  contestantId: string
  contestant: Contestant | undefined
  isSoleSurvivor?: boolean
  isDoubled?: boolean
  ssWindowOpen?: boolean
  swappedInEpisode?: number | null
  right?: ReactNode
  // Query string carrying the context you came from, so the contestant page
  // can scope swiping to this roster and show what they earned you (#262).
  // Only My Season passes it — on another player's team it would be wrong.
  linkSuffix?: string
  // Optional tap-to-expand per-episode breakdown (#257): when onToggle is
  // given, a chevron reveals `children` below the row.
  expanded?: boolean
  onToggle?: () => void
  children?: ReactNode
}) {
  const outEp = contestant?.eliminated_in_episode ?? null
  const ssTitle = 'Sole Survivor — finale points are worth an extra 50%'
  // One line of provenance under the name: why this entry looks the way it
  // does. Exit beats swap-in beats tribe, because that's the order you care.
  const note =
    outEp != null
      ? `Out · episode ${outEp}`
      : swappedInEpisode != null
        ? `Swapped in · episode ${swappedInEpisode}`
        : (contestant?.tribe_name ?? null)

  return (
    <li className="border-t border-paper-line first:border-t-0">
      {/* Tapping the row opens the breakdown — that's where your own scoring
          lives, including 2x roster points. The name and photograph stay a
          link to the contestant's page; stopPropagation keeps it from also
          expanding. The chevron remains the keyboard/screen-reader control. */}
      <div
        className={`flex items-center gap-3 px-3 py-2.5 ${onToggle ? 'cursor-pointer' : ''}`}
        onClick={onToggle}
      >
        <Link
          to={`/contestants/${contestantId}${linkSuffix}`}
          onClick={(e) => e.stopPropagation()}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <span
            className={`shrink-0 ${outEp != null ? 'opacity-60 grayscale' : ''}`}
            title={outEp != null ? `Voted out · episode ${outEp}` : 'Still in the game'}
          >
            <ContestantAvatar
              name={contestant?.name ?? '—'}
              imageUrl={contestant?.image_url ?? null}
              square
            />
          </span>
          <span className="min-w-0">
            <span
              className={`block truncate font-display text-base tracking-wide uppercase ${
                outEp != null
                  ? 'text-paper-ink-faded line-through decoration-1'
                  : 'text-paper-ink'
              }`}
            >
              {contestant?.name ?? '—'}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {note && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-paper-ink-faded">
                  {outEp == null && swappedInEpisode == null && contestant?.tribe_color && (
                    <span
                      className="size-1.5 rounded-full ring-1 ring-black/15"
                      style={{ backgroundColor: contestant.tribe_color }}
                      aria-hidden
                    />
                  )}
                  {note}
                </span>
              )}
              {isSoleSurvivor && (
                <span
                  className={`text-[9px] font-extrabold uppercase tracking-[0.1em] px-1 py-px border ${
                    ssWindowOpen
                      ? 'border-stone-400 text-stone-500'
                      : 'border-amber-500 bg-amber-400/20 text-amber-800'
                  }`}
                  title={
                    ssWindowOpen
                      ? `${ssTitle} — changeable until the designation locks`
                      : ssTitle
                  }
                >
                  Sole Survivor
                </span>
              )}
              {isDoubled && (
                <span
                  className="text-[9px] font-extrabold uppercase tracking-[0.1em] px-1 py-px border border-ember-500 bg-ember-100 text-ember-800"
                  title="Double Roster Points is active for this episode"
                >
                  ×2
                </span>
              )}
            </span>
          </span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-1 pl-1">
          {right}
          {onToggle && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
              aria-expanded={expanded}
              aria-label="Toggle episode breakdown"
              className="-mr-1 p-1 text-paper-ink-faded hover:text-paper-ink"
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
        <div className="border-t border-paper-line px-3 py-3">{children}</div>
      )}
    </li>
  )
}

/** The leaf the roster is written on: aged paper and a ruled column header. */
export function RosterManifest({ children }: { children: ReactNode }) {
  return (
    <div className="record-paper overflow-hidden rounded-sm border border-paper-edge shadow-sm">
      <div className="flex items-center gap-3 border-b-2 border-paper-edge px-3 pt-1.5 pb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-paper-ink-faded">
        <span>Castaway</span>
        <span className="ml-auto">Points</span>
      </div>
      <ul>{children}</ul>
    </div>
  )
}
