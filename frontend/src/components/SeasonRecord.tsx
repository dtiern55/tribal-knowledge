import type { ReactNode } from 'react'

/**
 * My Season as one document (#396).
 *
 * The page used to be three containers stacked on a background, which is what
 * kept reading as disjointed no matter how evenly the headings were weighted:
 * the parts shared a heading style but never a surface. Roster, Ballot and
 * Advantage now sit on one sheet as ruled sections of a single record, so
 * there is nothing to be disjointed *between*.
 */
export function SeasonRecord({ children }: { children: ReactNode }) {
  return (
    <div className="record-paper overflow-hidden rounded-lg border border-paper-edge shadow-sm">
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
}: {
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={title}>
      <div className="flex items-baseline gap-2 border-b border-paper-edge px-4 pt-3 pb-1">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-paper-ink-faded">
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
