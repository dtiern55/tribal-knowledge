import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'

/**
 * Dragging the played ×2 idol across beats (#487). The idol is the one token
 * for the week's play: drag it off a roster row onto the Ballot tab to make it
 * a ballot double, onto another castaway to reassign, or — from the ballot —
 * onto the Roster tab to pick a castaway to double instead. The Advantage tap
 * paths remain the non-drag equivalent, so this is enhancement only.
 */
export type DropSource = 'roster' | 'ballot'

export type DropAction =
  | { kind: 'reassign_roster'; target: string }
  | { kind: 'to_ballot' }
  | { kind: 'to_roster_picking' }
  | { kind: 'none' }

/** Pure: what dropping a `source` idol on `dropId` should do. Beat tabs carry
 *  `beat:<key>` drop ids; any other id is a castaway row. */
export function resolveDrop(source: DropSource, dropId: string): DropAction {
  if (source === 'roster') {
    if (dropId === 'beat:ballot') return { kind: 'to_ballot' }
    if (dropId.startsWith('beat:')) return { kind: 'none' }
    return { kind: 'reassign_roster', target: dropId }
  }
  // A ballot double has no castaway target, so its only move is back to roster,
  // where you then pick who gets it (matching the Advantage → Roster ×2 flow).
  if (dropId === 'beat:roster') return { kind: 'to_roster_picking' }
  return { kind: 'none' }
}

export type DragState = { x: number; y: number; overId: string | null; releasing?: boolean }

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Pointer-drag a seal onto any `[data-drop-id]` the caller accepts. Layout-free
 * hit-testing via `elementFromPoint`; the hovered target gets a `data-drag-over`
 * attribute for CSS feedback. The lifted ghost is drawn by the caller from
 * `drag`. `opts` is read through a ref so the window handlers always see fresh
 * values without re-subscribing mid-drag.
 *
 * On a missed drop the ghost springs back to the grab point instead of blinking
 * out (#487).
 */
export function useSealDrag(opts: {
  disabled?: boolean
  canDropOn: (id: string) => boolean
  onDrop: (id: string) => void
}) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragging = drag != null
  const ref = useRef(opts)
  ref.current = opts
  const origin = useRef({ x: 0, y: 0 })

  function start(e: ReactPointerEvent) {
    if (ref.current.disabled) return
    e.preventDefault()
    e.stopPropagation()
    origin.current = { x: e.clientX, y: e.clientY }
    setDrag({ x: e.clientX, y: e.clientY, overId: null })
  }

  useEffect(() => {
    if (!dragging) return
    let hot: Element | null = null
    const setHot = (el: Element | null) => {
      if (hot === el) return
      hot?.removeAttribute('data-drag-over')
      el?.setAttribute('data-drag-over', '')
      hot = el
    }
    const targetAt = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y)?.closest('[data-drop-id]') ?? null
      const id = el?.getAttribute('data-drop-id') ?? null
      const ok = id != null && ref.current.canDropOn(id)
      setHot(ok ? el : null)
      return ok ? id : null
    }
    const move = (e: PointerEvent) =>
      setDrag((d) => d && { x: e.clientX, y: e.clientY, overId: targetAt(e.clientX, e.clientY) })
    const end = (e: PointerEvent) => {
      const overId = targetAt(e.clientX, e.clientY)
      setHot(null)
      if (overId) {
        setDrag(null)
        ref.current.onDrop(overId)
        return
      }
      if (prefersReducedMotion()) {
        setDrag(null)
        return
      }
      // Snap the ghost back to where it was grabbed, then clear it. Outlasts the
      // .seal-ghost--releasing transition (240ms) so it finishes before unmount.
      setDrag((d) => d && { ...d, x: origin.current.x, y: origin.current.y, releasing: true })
      window.setTimeout(() => setDrag(null), 250)
    }
    const cancel = () => {
      setHot(null)
      setDrag(null)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', cancel)
    return () => {
      setHot(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [dragging])

  return { drag, dragging, start }
}
