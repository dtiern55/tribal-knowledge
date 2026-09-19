import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

const HINT_KEY = 'tk-swipe-hint-seen'

/**
 * Round prev/next chevron buttons for a detail-page header — the desktop
 * stand-in for the swipe gesture, stepping through siblings (players by rank,
 * castaways by boot order) without a bottom button bar. Shared by the Team and
 * Contestant pages.
 *
 * The "3 / 18" between them says there's a sequence to move through, and the
 * first time a touch device lands here the page nudges sideways under a
 * "Swipe" caption, once per browser, so the gesture isn't a secret.
 */
export function HeaderPager({
  prev,
  next,
  prevLabel,
  nextLabel,
  index,
  total,
}: {
  prev?: string
  next?: string
  prevLabel?: string
  nextLabel?: string
  index: number
  total: number
}) {
  const navigate = useNavigate()
  const [hint, setHint] = useState(false)
  const canPage = !!(prev || next)

  useEffect(() => {
    if (!canPage || localStorage.getItem(HINT_KEY)) return
    if (!window.matchMedia('(pointer: coarse)').matches) return
    // The nudge moves the whole page, which this header can't wrap, so it
    // borrows Layout's <main> for the one run.
    const main = document.getElementById('main-content')
    // Marked seen when it actually plays, not on mount, so a page left inside
    // the delay (or StrictMode's throwaway first run) doesn't spend it.
    const start = setTimeout(() => {
      localStorage.setItem(HINT_KEY, '1')
      setHint(true)
      main?.classList.add('swipe-nudge')
    }, 700)
    const stop = setTimeout(() => {
      setHint(false)
      main?.classList.remove('swipe-nudge')
    }, 4000)
    return () => {
      clearTimeout(start)
      clearTimeout(stop)
      main?.classList.remove('swipe-nudge')
    }
  }, [canPage])

  const btn =
    'inline-flex size-9 items-center justify-center rounded-full border border-cream-200 bg-cream-50 text-lg text-forest-800' +
    ' transition-colors hover:border-forest-400 hover:bg-white disabled:opacity-30 disabled:pointer-events-none'
  return (
    <div className="relative flex items-center gap-2">
      <button onClick={() => prev && navigate(prev, { replace: true })} disabled={!prev} aria-label={prevLabel ? `Previous: ${prevLabel}` : 'Previous'} className={btn}>
        <span aria-hidden>‹</span>
      </button>
      {index >= 0 && total > 1 && (
        <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums text-forest-700">
          {index + 1} / {total}
        </span>
      )}
      <button onClick={() => next && navigate(next, { replace: true })} disabled={!next} aria-label={nextLabel ? `Next: ${nextLabel}` : 'Next'} className={btn}>
        <span aria-hidden>›</span>
      </button>
      {hint && (
        <span aria-hidden className="swipe-hint-caption pointer-events-none absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded-full bg-forest-600 px-3 py-1 text-xs font-semibold text-white shadow">
          ‹ Swipe for the next one ›
        </span>
      )}
    </div>
  )
}
