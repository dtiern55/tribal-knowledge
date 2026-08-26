import type { ReactNode } from 'react'
import { TeamBuffPairIcon } from './icons'
import { VoteMark } from './VoteMark'

/**
 * My Season's lane furniture.
 *
 * The page was one paper record with ruled sections (#396) — Roster and Ballot
 * as divisions of a single document. The redesign gives each lane a colour and
 * an object of its own instead: gold for the weekly advantage, jade for your
 * team, terracotta for your ballot, carried from the hero's status tiles
 * through these tabs into each card's header band. Nothing here knows what a
 * lane contains; it only knows which colour it wears.
 */

export type BeatKey = 'roster' | 'ballot'

export type Beat = {
  key: BeatKey
  label: string
  /** Settled — nothing left to decide on this beat this week. */
  done: boolean
  note: string
}

/** Each lane's colour and mark, carried from the hero through here into the
 *  card each tab reveals. */
const LANE: Record<BeatKey, 'jade' | 'terracotta'> = {
  roster: 'jade',
  ballot: 'terracotta',
}

/** The tab is the lane's only header now, so it carries the lane's icon
 *  rather than a plain colour dot. */
const LANE_ICON: Record<BeatKey, () => ReactNode> = {
  roster: () => <TeamBuffPairIcon className="w-[18px] h-[18px]" />,
  ballot: () => <VoteMark className="w-[18px] h-[18px]" />,
}

/**
 * The record's two beats (#396 follow-up), now colour-coded lane tabs.
 *
 * They were ruled tabs on the record's paper, which made both lanes read the
 * same until you got to the label. As filled pills in their lane's colour the
 * active one names itself at a glance, and the inactive one still carries its
 * lane dot and its settled check. The idol's ×2 chip is gone from the tabs —
 * the idol lives on its target (the doubled roster row / ballot seal) and its
 * status is in the hero's Advantage tile (#487).
 *
 * A real tablist: roving tabindex, arrow keys, and panels that stay mounted so
 * an unsaved ballot survives a look at the roster. The tabs double as
 * cross-beat drop targets for the idol drag.
 */
export function RecordBeats({
  value,
  onChange,
  beats,
}: {
  value: BeatKey
  onChange: (key: BeatKey) => void
  beats: Beat[]
}) {
  function onKeyDown(e: React.KeyboardEvent) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const i = beats.findIndex((b) => b.key === value)
    const next = beats[(i + delta + beats.length) % beats.length]
    onChange(next.key)
    document.getElementById(`beat-${next.key}`)?.focus()
  }

  return (
    <div role="tablist" aria-label="Season record" onKeyDown={onKeyDown} className="lane-tabs">
      {beats.map((b) => {
        const active = b.key === value
        return (
          <button
            key={b.key}
            id={`beat-${b.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`panel-${b.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(b.key)}
            data-drop-id={`beat:${b.key}`}
            data-lane={LANE[b.key]}
            className="lane-tab"
          >
            <span className="lane-tab__icon" aria-hidden="true">{LANE_ICON[b.key]()}</span>
            <span className="truncate">{b.label}</span>
            {b.done && !active && (
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5 flex-none text-jade-600"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m3 8.5 3 3 7-8" />
              </svg>
            )}
            <span className="sr-only">{b.note}</span>
            <span className="sr-only">{b.done ? '— done' : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Tabs and the lane they reveal, as one object.
 *
 * The redesign had them as separate stacked cards — a row of pills, a gap,
 * then an elevated card — which lost what the one-sheet record (#396) got
 * right: a lane read as a single thing you were looking at. They share a
 * border again, with the active tab in its lane's colour running straight into
 * that lane's header band, so the tab is the top edge of the card rather than a
 * control floating above it.
 */
export function LaneStack({
  lane,
  glowOut = false,
  children,
}: {
  /** The lane currently showing — colours the stack and its night treatment. */
  lane: 'jade' | 'terracotta'
  /** Let a lit row's halo out of the stack, which otherwise clips it. */
  glowOut?: boolean
  children: ReactNode
}) {
  return (
    <div className="lane-stack" data-lane={lane} data-glow={glowOut || undefined}>
      {children}
    </div>
  )
}

/** The panel a beat reveals. Stays mounted when inactive so in-progress edits
 *  (an unsaved ballot, a half-built roster) survive switching beats. */
export function RecordPanel({
  beat,
  active,
  children,
  className = '',
}: {
  beat: BeatKey
  active: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div
      id={`panel-${beat}`}
      role="tabpanel"
      aria-labelledby={`beat-${beat}`}
      hidden={!active}
      data-active={active}
      className={`beat-panel ${className}`}
    >
      {children}
    </div>
  )
}
