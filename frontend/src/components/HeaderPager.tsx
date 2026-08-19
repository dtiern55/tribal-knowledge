import { useNavigate } from 'react-router'

/**
 * Round prev/next chevron buttons for a detail-page header — the desktop
 * stand-in for the swipe gesture, stepping through siblings (players by rank,
 * castaways by boot order) without a bottom button bar. Shared by the Team and
 * Contestant pages.
 */
export function HeaderPager({
  prev,
  next,
  prevLabel,
  nextLabel,
}: {
  prev?: string
  next?: string
  prevLabel?: string
  nextLabel?: string
}) {
  const navigate = useNavigate()
  const btn =
    'inline-flex size-9 items-center justify-center rounded-full border border-cream-200 bg-cream-50 text-lg text-forest-800' +
    ' transition-colors hover:border-forest-400 hover:bg-white disabled:opacity-30 disabled:pointer-events-none'
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => prev && navigate(prev, { replace: true })} disabled={!prev} aria-label={prevLabel ? `Previous: ${prevLabel}` : 'Previous'} className={btn}>
        <span aria-hidden>‹</span>
      </button>
      <button onClick={() => next && navigate(next, { replace: true })} disabled={!next} aria-label={nextLabel ? `Next: ${nextLabel}` : 'Next'} className={btn}>
        <span aria-hidden>›</span>
      </button>
    </div>
  )
}
