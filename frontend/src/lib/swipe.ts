import { useEffect } from 'react'
import { useNavigate } from 'react-router'

/**
 * Left/right navigation between siblings — the next castaway, the next
 * player's team.
 *
 * Swipe is the point, but it's touch-only and invisible, so this also renders
 * labelled prev/next buttons and binds the arrow keys. The gesture is the
 * shortcut, never the only way through.
 *
 * Every move REPLACES history rather than pushing. Sideways movement through
 * a list isn't drilling deeper, and pushing made Back walk you through every
 * castaway you'd swiped past instead of returning to the list you came from —
 * which read as the Back button "registering as a swipe".
 */
export function useSwipeNav(prev?: string, next?: string) {
  const navigate = useNavigate()

  useEffect(() => {
    let startX = 0
    let startY = 0
    let tracking = false

    function onStart(e: TouchEvent) {
      if (e.touches.length !== 1) return
      // Don't hijack a drag that began on a control — pulling a <select>
      // open and releasing sideways shouldn't change the page.
      const el = e.target as Element | null
      if (el?.closest?.('button, a, select, input, textarea')) return
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      tracking = true
    }
    function onEnd(e: TouchEvent) {
      if (!tracking) return
      tracking = false
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      // Comfortably horizontal and long enough not to fire on a scroll or a
      // tap wobble.
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
      const target = dx < 0 ? next : prev
      if (target) navigate(target, { replace: true })
    }
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return
      if (e.key === 'ArrowLeft' && prev) navigate(prev, { replace: true })
      if (e.key === 'ArrowRight' && next) navigate(next, { replace: true })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('keydown', onKey)
    }
  }, [prev, next, navigate])
}
