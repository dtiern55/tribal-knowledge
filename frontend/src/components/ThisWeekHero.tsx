import type { ReactNode } from 'react'

/**
 * The "This Week" command hero (My Season redesign).
 *
 * The page used to open on a masthead that named the season and then made you
 * read three sections to find out what you still owed. The hero answers that
 * first: what week it is, whether you're done, and the one weekly control that
 * isn't reachable any other way — the advantage idol.
 *
 * It deliberately carries no Roster or Ballot shortcut. The first draft gave
 * each lane a status tile here, which put a second row of buttons directly
 * above the tabs that already switch lanes; the tabs carry their own settled
 * check, so the tiles were duplicating both the navigation and the status.
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
  /** The weekly advantage lane. */
  children?: ReactNode
}) {
  return (
    <section aria-label="This week" className="week-hero relative rounded-2xl px-4 pt-3.5 pb-4">
      <div className="flex items-start gap-2.5">
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
      {children}
    </section>
  )
}

/**
 * The advantage lane inside the hero: the idol, what it's resting on, and a
 * gold check once it's spent. `icon` is the idol itself, which stays the drag
 * handle and the tap menu's trigger — this only supplies the frame.
 */
export function HeroLane({
  label,
  note,
  icon,
  done = false,
  muted = false,
}: {
  label: string
  note: ReactNode
  icon: ReactNode
  done?: boolean
  /** The lane is closed for the week — locked, or left unplayed. */
  muted?: boolean
}) {
  return (
    <div className="hero-lane" data-muted={muted || undefined}>
      <span className="hero-lane__icon">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="hero-lane__label">{label}</span>
        <span className="hero-lane__note">{note}</span>
      </span>
      {done && (
        <span className="hero-lane__check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
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
