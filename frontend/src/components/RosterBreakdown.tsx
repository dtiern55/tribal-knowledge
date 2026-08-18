import { useState } from 'react'
import type { ContestantPerformance } from '../types'

/**
 * Per-episode breakdown for one rostered contestant (#257, #271): each episode
 * is its own collapsed row (total on the right, "2x Points" pill when you played
 * Double Roster Points there); expanding it itemizes the scoring events plus a
 * final "Double Roster Points bonus" line. Scoped to your active
 * range for the pick. ponytail: reconciles to the row total for the common case;
 * swap penalties and finale placement/SS-double aren't per-episode scoring
 * events, so they aren't itemized here.
 */
export function RosterBreakdown({
  perf,
  activeFrom,
  activeUntil,
  doubledByEp,
}: {
  perf: ContestantPerformance | undefined
  activeFrom: number
  activeUntil: number | null
  doubledByEp: Map<number, number>
}) {
  const [openEps, setOpenEps] = useState<Set<number>>(new Set())
  function toggle(n: number) {
    setOpenEps((cur) => {
      const next = new Set(cur)
      if (!next.delete(n)) next.add(n)
      return next
    })
  }
  if (!perf) return <p className="text-xs text-gray-500">Loading…</p>
  const eps = perf.episodes
    .filter(
      (e) =>
        e.episode_number >= activeFrom &&
        (activeUntil == null || e.episode_number <= activeUntil),
    )
    // Newest episode first — most recent is what you check after an airing.
    .sort((a, b) => b.episode_number - a.episode_number)
  if (eps.length === 0)
    return <p className="text-xs text-gray-500">No scored episodes yet.</p>
  const allOpen = eps.every((e) => openEps.has(e.episode_number))
  return (
    <div className="space-y-2">
      {eps.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={() =>
              setOpenEps(allOpen ? new Set() : new Set(eps.map((e) => e.episode_number)))
            }
            className="text-[11px] font-semibold uppercase tracking-wide text-forest-700 underline underline-offset-2"
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}
      {eps.map((ep) => {
        const bonus = doubledByEp.get(ep.episode_number) ?? 0
        const total = ep.points + bonus
        const events = ep.events.filter((e) => e.points !== 0)
        const open = openEps.has(ep.episode_number)
        return (
          <div key={ep.episode_number} className="text-xs">
            <button
              onClick={() => toggle(ep.episode_number)}
              aria-expanded={open}
              className="w-full flex items-center gap-2 text-left font-medium text-gray-700"
            >
              <span className="flex flex-col items-start gap-0.5">
                <span>Episode {ep.episode_number}</span>
                {bonus !== 0 && (
                  <span className="rounded-full bg-forest-50 border border-forest-100 px-1.5 py-0.5 text-[11px] font-semibold text-forest-700">
                    2x Points
                  </span>
                )}
              </span>
              <span
                className={`ml-auto ${
                  total > 0 ? 'text-jade-600' : total < 0 ? 'text-terracotta-500' : 'text-gray-500'
                }`}
              >
                {total} pts
              </span>
              <svg
                viewBox="0 0 24 24"
                className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${
                  open ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {open && (
              <ul className="mt-1 space-y-0.5 pl-3 text-gray-500">
                {events.map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {e.label}
                      {e.quantity > 1 && ` ×${e.quantity}`}
                    </span>
                    <span className={e.points > 0 ? 'text-jade-600' : 'text-terracotta-500'}>
                      {e.points} pts
                    </span>
                  </li>
                ))}
                {bonus !== 0 && (
                  <li className="flex justify-between gap-2 text-forest-600 font-medium">
                    <span>Double Roster Points bonus</span>
                    <span>{bonus} pts</span>
                  </li>
                )}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
