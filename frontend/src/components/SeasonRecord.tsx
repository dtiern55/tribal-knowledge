import type { ReactNode } from 'react'
import { WaxSeal } from './WaxSeal'

/**
 * My Season as one document (#396).
 *
 * The page used to be three containers stacked on a background, which is what
 * kept reading as disjointed no matter how evenly the headings were weighted:
 * the parts shared a heading style but never a surface. Roster, Ballot and
 * Advantage now sit on one sheet as ruled sections of a single record, so
 * there is nothing to be disjointed *between*.
 */
export function SeasonRecord({
  children,
  glowOut = false,
}: {
  children: ReactNode
  /** Let a lit row's halo out of the record, which otherwise clips it. */
  glowOut?: boolean
}) {
  return (
    <div
      className={`record-paper rounded-lg border border-paper-edge shadow-sm ${
        glowOut ? 'stage-open' : 'overflow-hidden'
      }`}
    >
      {children}
    </div>
  )
}

/** The record's masthead: whose season this is, and where it's up to. */
export function RecordHead({
  title,
  meta,
  right,
}: {
  title: string
  meta?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b-2 border-paper-edge px-4 py-3">
      <div className="min-w-0">
        <h1 className="font-display text-xl tracking-wide text-ocean-800 md:text-2xl">{title}</h1>
        {meta && (
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-paper-ink-faded">
            {meta}
          </p>
        )}
      </div>
      {right}
    </div>
  )
}

/**
 * A ruled section header inside the record.
 *
 * Deliberately a small letterspaced label rather than a display heading: these
 * are divisions of one document, not titles of three. It stays a real `h2` so
 * the page keeps its outline, and the section it labels is a landmark.
 */
export function RecordSection({
  title,
  right,
  children,
  bare = false,
}: {
  title: string
  right?: ReactNode
  children: ReactNode
  /** Under the beat bar the tab IS the heading, so the section drops its own
   *  and keeps only its action. */
  bare?: boolean
}) {
  if (bare) {
    return (
      <div>
        {right && <div className="flex justify-end px-4 pt-2">{right}</div>}
        {children}
      </div>
    )
  }
  return (
    <section aria-label={title}>
      <div className="flex items-baseline gap-2 border-b-2 border-paper-edge bg-black/[.025] px-4 pt-2.5 pb-1.5">
        <h2 className="text-xs font-extrabold uppercase tracking-[0.2em] text-paper-ink">
          {title}
        </h2>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </section>
  )
}

/** One line of the record — an entry, an option, a play. */
export function RecordLine({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`border-b border-paper-line px-4 py-2.5 last:border-b-0 ${className}`}>
      {children}
    </div>
  )
}

export type BeatKey = 'roster' | 'ballot' | 'advantage'

export type Beat = {
  key: BeatKey
  label: string
  /** Settled — nothing left to decide on this beat this week. */
  done: boolean
  /** The week's advantage is resting on this beat. */
  doubled?: boolean
  note: string
}

/**
 * The record's three beats (#396 follow-up).
 *
 * Roster, Ballot and Advantage were three stacked sections of one sheet; they
 * are now one at a time under the masthead. Each tab carries its own state —
 * a count, a check when settled, a ×2 when the week's play rests there — so
 * the week is legible without opening all three.
 *
 * A real tablist: roving tabindex, arrow keys, and panels that stay mounted so
 * an unsaved ballot survives a look at the roster.
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
    <div
      role="tablist"
      aria-label="Season record"
      onKeyDown={onKeyDown}
      className="flex items-stretch border-b-2 border-paper-edge bg-black/[.025]"
    >
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
            className={`flex min-h-12 min-w-0 flex-1 flex-col items-start gap-0.5 px-3 py-2 text-left border-b-[3px] ${
              active ? 'border-ember-500' : 'border-transparent'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <span
                className={`text-[11px] font-extrabold uppercase tracking-[0.2em] ${
                  active ? 'text-paper-ink' : 'text-paper-ink-faded'
                }`}
              >
                {b.label}
              </span>
              {/* The glyph is decorative; "done" rides on the tab's own name. */}
              {b.done && (
                <span
                  aria-hidden="true"
                  className="grid h-3.5 w-3.5 flex-none place-items-center rounded-full bg-jungle-600 text-[9px] font-bold text-white"
                >
                  ✓
                </span>
              )}
              {/* The doubled beat echoes the roster row's wax seal, shrunk to a
                  small stamp on the tab (#397/#407). */}
              {b.doubled && <WaxSeal size={18} detail="min" />}
              <span className="sr-only">{b.done ? '— done' : ''}</span>
            </span>
            <span
              className={`max-w-full truncate text-[10px] ${
                active ? 'text-paper-ink-faded' : 'text-[#5f584d]'
              }`}
            >
              {b.note}
            </span>
          </button>
        )
      })}
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
      className={className}
    >
      {children}
    </div>
  )
}
