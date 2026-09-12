import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Contestant } from '../types'
import { ContestantAvatar, ELIMINATED_DIM, ELIMINATED_STRIKE } from './ContestantAvatar'
import { DoubleBadge } from './DoubleBadge'
import { Torch, TorchDefs } from './Torch'
import { displayName } from '../lib/cast'

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
  showSoleSurvivorHalo = false,
  soleSurvivorBonus = 0,
  isDoubled = false,
  ssWindowOpen = false,
  swappedInEpisode = null,
  onUndoSwap,
  right,
  linkSuffix = '',
  bioLink = true,
  onSelect,
  selected = false,
  lit = false,
  expanded = false,
  onToggle,
  seal = true,
  prominent = false,
  children,
}: {
  contestantId: string
  contestant: Contestant | undefined
  isSoleSurvivor?: boolean
  showSoleSurvivorHalo?: boolean
  // The +50% finale bonus this designation earned, named on the badge so the
  // points land somewhere visible. 0 shows just the badge (no bonus yet).
  soleSurvivorBonus?: number
  isDoubled?: boolean
  ssWindowOpen?: boolean
  swappedInEpisode?: number | null
  /** Reverse the swap that brought this castaway in; only while it is still open. */
  onUndoSwap?: () => void
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
  // Whether a doubled row wears the idol. My Season says it in words and
  // puts the idol on the tab instead (#694); another player's team keeps it.
  seal?: boolean
  // The My Team card's scale (My Season redesign): a 42px portrait and a
  // larger name, so your own five read as people rather than manifest lines.
  // Another player's team keeps the compact manifest row.
  prominent?: boolean
  children?: ReactNode
}) {
  const name = contestant ? displayName(contestant) : '—'
  const outEp = contestant?.eliminated_in_episode ?? null
  const ssTitle = 'Sole Survivor — finale points are worth an extra 50%'
  // The note under the name is tribe (with its colour dot) for anyone still in;
  // a boot shows when it happened instead. A swap-in is provenance, not a
  // replacement for the tribe — it rides as its own tag so the tribe stays
  // visible (#406 review).
  const note = outEp != null ? `Out · episode ${outEp}` : (contestant?.tribe_name ?? null)
  // On the team card the doubled row says so in its own tribe line — the idol
  // by the score is the mark, this is the words (My Season redesign).
  const doubledNote = prominent && isDoubled && outEp == null

  // At row scale the idol rests near the points column, not as a tiny suffix on
  // the castaway's name. The tilt keeps it feeling hand-placed.
  const doubleSeal =
    isDoubled && seal ? (
      <span className="relative z-10 -my-3 mr-1 shrink-0 translate-y-0.5 rotate-[9deg]">
        <DoubleBadge size={36} />
      </span>
    ) : null

  const avatar = (
    <>
      <ContestantAvatar
        name={name}
        imageUrl={contestant?.image_url ?? null}
        tribeColor={contestant?.tribe_color ?? null}
        tribeName={contestant?.tribe_name ?? null}
        size={prominent ? 'lg' : 'md'}
      />
    </>
  )

  const hasSoleSurvivorHalo = isSoleSurvivor && showSoleSurvivorHalo
  const avatarClass = `relative inline-flex shrink-0 ${
    hasSoleSurvivorHalo
      ? `sole-survivor-halo ${prominent ? 'sole-survivor-halo--prominent' : ''} ${
          outEp != null ? 'sole-survivor-halo--snuffed' : ''
        }`
      : ''
  } ${outEp != null ? ELIMINATED_DIM : ''}`

  // The Sole Survivor's mark is the corner flame badge on the portrait (My
  // Season, via showSoleSurvivorHalo). On cards without that badge (e.g. the Team
  // page) it falls back to the champion flame + a gold label below the name.
  const inner = (
    <>
      <span
        className={avatarClass}
        title={outEp != null ? `Voted out · episode ${outEp}` : 'Still in the game'}
      >
        {avatar}
      </span>
      <span className="min-w-0 text-left">
        <span className="flex items-center gap-2">
          <span
            className={`min-w-0 truncate font-display uppercase ${
              prominent ? 'text-[1.05rem] font-semibold' : 'text-base tracking-wide'
            } ${outEp != null ? `text-paper-ink-faded ${ELIMINATED_STRIKE}` : 'text-paper-ink'}`}
          >
            {name}
          </span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {note && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-paper-ink-faded">
              {outEp == null && contestant?.tribe_color && (
                <span
                  className="tribe-marker"
                  style={{ backgroundColor: contestant.tribe_color }}
                  aria-hidden
                />
              )}
              {note}
              {doubledNote && ' · ×2 this week'}
            </span>
          )}
          {/* Nobody has a tribe before the first one is set, so the doubled
              note needs a home of its own when there's no tribe line. */}
          {!note && doubledNote && (
            <span className="inline-flex items-center text-[10px] uppercase tracking-[0.08em] text-paper-ink-faded">
              ×2 this week
            </span>
          )}
          {outEp == null && swappedInEpisode != null && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-paper-edge bg-black/[.03] px-1.5 py-px text-[10px] font-extrabold tracking-[0.04em] text-paper-ink-faded"
              title={`Swapped onto your roster in episode ${swappedInEpisode}`}
            >
              {/* Two-arrow swap glyph + the episode it happened. Provenance, so
                  it stays neutral — gold here would compete with the idol and
                  Sole Survivor marks on the same row. */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3 shrink-0"
                aria-hidden
              >
                <path d="M3 9h15" />
                <path d="M15 6l3 3-3 3" />
                <path d="M21 15H6" />
                <path d="M9 12l-3 3 3 3" />
              </svg>
              <span className="tabular-nums">{swappedInEpisode}</span>
            </span>
          )}
          {onUndoSwap && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onUndoSwap()
              }}
              className="text-[10px] font-semibold uppercase tracking-[0.08em] text-forest-700 underline underline-offset-2"
            >
              Undo swap
            </button>
          )}
          {isSoleSurvivor && !hasSoleSurvivorHalo && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${
                ssWindowOpen ? 'text-stone-500' : 'text-gold-800'
              }`}
              title={ssWindowOpen ? `${ssTitle} — changeable until the designation locks` : ssTitle}
            >
              {/* Fallback mark for cards without the corner badge (e.g. the Team
                  page): the champion flame + gold label. Its own TorchDefs so the
                  card stands alone. */}
              <TorchDefs />
              <Torch champion lit title="" className="h-4 w-4 shrink-0" />
              Sole Survivor{soleSurvivorBonus > 0 && ` · +${soleSurvivorBonus}`}
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
        className={`stage-row flex items-center gap-3 transition-transform ${
          lit ? 'stage-pick' : selected ? 'stage-held' : ''
        } ${
          onSelect
            ? 'p-0'
            : `${prominent ? 'px-4 py-2.5' : 'px-3 py-2.5'} ${onToggle ? 'cursor-pointer' : ''}`
        }`}
        onClick={onSelect ? undefined : onToggle}
      >
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={`flex w-full items-center gap-3 ${prominent ? 'px-4' : 'px-3'} py-2.5 text-left`}
          >
            {inner}
            <span className="ml-auto flex shrink-0 items-center gap-1 pl-1">
              {doubleSeal}
              {right}
              {/* Reserve the chevron's width while picking, so the points don't
                  slide right when the toggle drops out of the row (#164). */}
              {onToggle && (
                <span aria-hidden className="invisible -mr-1 p-1">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              )}
            </span>
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
              {doubleSeal}
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
