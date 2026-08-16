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
  bioLink = true,
  onSelect,
  selected = false,
  lit = false,
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
  // Whether the name/photo link out to the contestant's bio. Off on My Season,
  // where the whole row belongs to expanding your own scoring — the bio lives
  // on the Cast page (#406 review). Other players' teams keep the link.
  bioLink?: boolean
  // While the Advantage section is asking who to double (#398) the row becomes
  // the answer: the whole line is a button, and the link out is suppressed so
  // a tap can't wander off to the contestant page mid-decision.
  onSelect?: () => void
  /** The play currently rests on this castaway — lit, quietly, all week. */
  selected?: boolean
  /** Taking the light right now, in the beat after being chosen. */
  lit?: boolean
  // Optional tap-to-expand per-episode breakdown (#257): when onToggle is
  // given, a chevron reveals `children` below the row.
  expanded?: boolean
  onToggle?: () => void
  children?: ReactNode
}) {
  const outEp = contestant?.eliminated_in_episode ?? null
  const ssTitle = 'Sole Survivor — finale points are worth an extra 50%'
  // The note under the name is tribe (with its colour dot) for anyone still in;
  // a boot shows when it happened instead. A swap-in is provenance, not a
  // replacement for the tribe — it rides as its own tag so the tribe stays
  // visible (#406 review).
  const note = outEp != null ? `Out · episode ${outEp}` : (contestant?.tribe_name ?? null)

  const inner = (
    <>
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
      <span className="min-w-0 text-left">
        <span
          className={`block truncate font-display text-base tracking-wide uppercase ${
            outEp != null ? 'text-paper-ink-faded line-through decoration-1' : 'text-paper-ink'
          }`}
        >
          {contestant?.name ?? '—'}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {note && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-paper-ink-faded">
              {outEp == null && contestant?.tribe_color && (
                <span
                  className="size-1.5 rounded-full ring-1 ring-black/15"
                  style={{ backgroundColor: contestant.tribe_color }}
                  aria-hidden
                />
              )}
              {note}
            </span>
          )}
          {outEp == null && swappedInEpisode != null && (
            <span
              className="text-[9px] font-extrabold uppercase tracking-[0.1em] px-1 py-px border border-paper-edge bg-black/[.03] text-paper-ink-faded"
              title={`Swapped onto your roster in episode ${swappedInEpisode}`}
            >
              Swapped in · ep {swappedInEpisode}
            </span>
          )}
          {isSoleSurvivor && (
            <span
              className={`text-[9px] font-extrabold uppercase tracking-[0.1em] px-1 py-px border ${
                ssWindowOpen
                  ? 'border-stone-400 text-stone-500'
                  : 'border-amber-500 bg-amber-400/20 text-amber-800'
              }`}
              title={ssWindowOpen ? `${ssTitle} — changeable until the designation locks` : ssTitle}
            >
              Sole Survivor
            </span>
          )}
          {/* Not a badge but a mark on a row already lit blue (#397/#407): the
              play lives on this castaway. The stage-held halo carries the
              emphasis; the pip names it. */}
          {isDoubled && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-ocean-700"
              title="Double Roster Points is active for this episode"
            >
              <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
              </svg>
              ×2 this episode
            </span>
          )}
        </span>
      </span>
    </>
  )

  // One wrapper for both modes. Rendering a <button> while choosing and a
  // <div> otherwise made React replace the node when the mode ended, and a
  // remounted element has no previous state to transition from — which is
  // what read as the row clicking back into place. The visual layer stays
  // put; only the interactive child inside it swaps.
  return (
    <li className="border-t border-paper-line first:border-t-0">
      <div
        className={`stage-row flex items-center gap-3 ${
          lit ? 'stage-pick' : selected ? 'stage-held' : onSelect ? '' : ''
        } ${onSelect ? 'p-0' : `px-3 py-2.5 ${onToggle ? 'cursor-pointer' : ''}`}`}
        onClick={onSelect ? undefined : onToggle}
      >
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
          >
            {inner}
            <span className="ml-auto flex shrink-0 items-center gap-1 pl-1">{right}</span>
          </button>
        ) : (
          <>
            {/* Tapping the row opens the breakdown — that's where your own
                scoring lives, including 2x roster points. With bioLink, the
                name and photograph are also a link to the contestant page
                (stopPropagation keeps that from expanding too); without it,
                the whole row just expands. The chevron is the keyboard/
                screen-reader control either way. */}
            {bioLink ? (
              <Link
                to={`/contestants/${contestantId}${linkSuffix}`}
                onClick={(e) => e.stopPropagation()}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                {inner}
              </Link>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-3">{inner}</span>
            )}
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
          </>
        )}
      </div>
      {onToggle && expanded && children && !onSelect && (
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
