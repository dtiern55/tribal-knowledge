import type { ReactNode } from 'react'

/**
 * The "This Week" command hero (My Season redesign).
 *
 * The page used to open on a masthead that named the season and then made you
 * read three sections to find out what you still owed. The hero answers that
 * first: what week it is, whether you're done, and one tile per lane —
 * Advantage (gold), Ballot (terracotta), Roster (jade) — each showing its own
 * done check or the thing you haven't done. The lanes carry those colours all
 * the way down the page, through the tabs and into the cards.
 */
export function ThisWeekHero({
  eyebrow,
  headline,
  sub,
  right,
  children,
}: {
  eyebrow: ReactNode
  headline: string
  sub?: ReactNode
  /** The compact My Points block. */
  right?: ReactNode
  /** The lane tiles — rendered in an even grid across the hero's foot. */
  children: ReactNode
}) {
  return (
    <section aria-label="This week" className="week-hero relative rounded-2xl px-4 pt-3.5 pb-4">
      <div className="mb-3 flex items-start gap-2.5">
        <div className="min-w-0">
          <div className="font-display text-xs font-bold uppercase tracking-[0.18em] text-gold-300">
            {eyebrow}
          </div>
          <h1 className="mt-0.5 font-display text-xl font-bold leading-tight text-cream-50">
            {headline}
          </h1>
          {sub && <p className="mt-1 text-[11px] text-cream-100/60">{sub}</p>}
        </div>
        {right && <div className="ml-auto shrink-0">{right}</div>}
      </div>
      <div className="hero-tiles">{children}</div>
    </section>
  )
}

export type Lane = 'gold' | 'terracotta' | 'jade'

/**
 * One lane's status tile. `done` stamps the lane-coloured check; `emphasis`
 * is the outstanding-task glow, which only ever belongs to one tile at a time.
 * Given `onClick` the whole tile is the shortcut to that lane's tab; the
 * Advantage tile passes its own idol as `icon` and keeps the drag handle there.
 */
export function HeroTile({
  lane,
  label,
  note,
  icon,
  done = false,
  emphasis = false,
  muted = false,
  onClick,
  ariaLabel,
}: {
  lane: Lane
  label: string
  note: ReactNode
  icon: ReactNode
  done?: boolean
  emphasis?: boolean
  /** The lane is closed for the week (locked, or an advantage left unplayed). */
  muted?: boolean
  onClick?: () => void
  ariaLabel?: string
}) {
  const body = (
    <>
      {done && (
        <span className="hero-tile__check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
      <span className="hero-tile__icon">{icon}</span>
      <span className="hero-tile__label">{label}</span>
      <span className="hero-tile__note">{note}</span>
    </>
  )
  const className = 'hero-tile'
  const data = {
    'data-lane': lane,
    'data-emphasis': emphasis || undefined,
    'data-muted': muted || undefined,
  }
  return onClick ? (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={className} {...data}>
      {body}
    </button>
  ) : (
    <div className={className} {...data}>
      {body}
    </div>
  )
}

/** Compact My Points for the hero's top-right: label, total, rank. */
export function HeroPoints({
  total,
  rankLabel,
  onClick,
  expanded,
}: {
  total: number
  rankLabel: string | null
  onClick?: () => void
  expanded?: boolean
}) {
  const inner = (
    <>
      <span className="block text-[9px] uppercase tracking-[0.12em] text-cream-100/55">My pts</span>
      <span className="block font-display text-2xl font-bold leading-none tabular-nums text-gold-300">
        {total}
      </span>
      {rankLabel && <span className="block text-[10px] text-cream-100/55">{rankLabel}</span>}
    </>
  )
  if (!onClick) return <div className="text-center">{inner}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls="header-points-breakdown"
      className="hero-points rounded-lg px-1 text-center"
    >
      {inner}
    </button>
  )
}
