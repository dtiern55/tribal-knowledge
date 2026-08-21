import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'

/**
 * Dragging the played ×2 idol across beats (#487). The idol is the one token
 * for the week's play: drag it off a roster row onto the Ballot tab to make it
 * a ballot double, onto another castaway to reassign, or — from the ballot —
 * onto the Roster tab to pick a castaway to double instead. The Advantage tap
 * paths remain the non-drag equivalent, so this is enhancement only.
 */
export type DropSource = 'roster' | 'ballot' | 'unplayed'

export type DropAction =
  | { kind: 'reassign_roster'; target: string }
  | { kind: 'to_ballot' }
  | { kind: 'to_roster_picking' }
  | { kind: 'none' }

/** Pure: what dropping a `source` idol on `dropId` should do. Beat tabs carry
 *  `beat:<key>` drop ids; any other id is a castaway row. */
export function resolveDrop(source: DropSource, dropId: string): DropAction {
  if (source === 'ballot') {
    // A ballot double has no castaway target, so its only move is back to
    // roster, where you then pick who gets it (like the Advantage → Roster tap).
    if (dropId === 'beat:roster') return { kind: 'to_roster_picking' }
    return { kind: 'none' }
  }
  // 'roster' (a played roster double) and 'unplayed' (the strip's idle idol)
  // both spend onto a castaway or the ballot; only 'unplayed' can also open the
  // pick sheet from the Roster tab, since it has no castaway yet to move.
  if (dropId === 'beat:ballot') return { kind: 'to_ballot' }
  if (dropId === 'beat:roster') {
    return source === 'unplayed' ? { kind: 'to_roster_picking' } : { kind: 'none' }
  }
  if (dropId.startsWith('beat:')) return { kind: 'none' }
  return { kind: 'reassign_roster', target: dropId }
}

export type DragState = { x: number; y: number; overId: string | null; releasing?: boolean }

// The ghost floats this far above the finger (so the thumb doesn't cover it),
// and the drop hit-tests at the same offset — so you aim the idol, not the
// finger, at the target. Shared with the ghost's own transform (#487).
export const SEAL_LIFT_Y = 28

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
  /** Pressed and released without dragging — a tap. Lets the same handle be a
   *  drag source and a keyboard/pointer button (the strip idol, #399). */
  onTap?: () => void
}) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragging = drag != null
  const ref = useRef(opts)
  ref.current = opts
  // Removes the active pointer listeners; set while a press is in flight.
  const teardown = useRef<(() => void) | null>(null)

  function start(e: ReactPointerEvent) {
    if (ref.current.disabled || teardown.current) return
    e.preventDefault()
    e.stopPropagation()
    const origin = { x: e.clientX, y: e.clientY }
    // The drag only begins once the pointer clears this radius, so a tap stays a
    // tap (fires onTap, no ghost) and small jitters don't move the play.
    let active = false
    let hot: Element | null = null
    const setHot = (el: Element | null) => {
      if (hot === el) return
      hot?.removeAttribute('data-drag-over')
      el?.setAttribute('data-drag-over', '')
      hot = el
    }
    const targetAt = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y - SEAL_LIFT_Y)?.closest('[data-drop-id]') ?? null
      const id = el?.getAttribute('data-drop-id') ?? null
      const ok = id != null && ref.current.canDropOn(id)
      setHot(ok ? el : null)
      return ok ? id : null
    }
    function finish() {
      setHot(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      teardown.current = null
    }
    function move(ev: PointerEvent) {
      if (!active) {
        if (Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 6) return
        active = true
      }
      ev.preventDefault()
      setDrag({ x: ev.clientX, y: ev.clientY, overId: targetAt(ev.clientX, ev.clientY) })
    }
    function up(ev: PointerEvent) {
      if (!active) {
        finish()
        ref.current.onTap?.()
        return
      }
      const overId = targetAt(ev.clientX, ev.clientY)
      finish()
      if (overId) {
        setDrag(null)
        ref.current.onDrop(overId)
      } else if (prefersReducedMotion()) {
        setDrag(null)
      } else {
        // Snap the ghost back to the grab point, then clear it. Outlasts the
        // 360ms .seal-ghost--releasing transition so it finishes before unmount.
        setDrag((d) => d && { ...d, x: origin.x, y: origin.y, releasing: true })
        window.setTimeout(() => setDrag(null), 375)
      }
    }
    function cancel() {
      finish()
      setDrag(null)
    }
    teardown.current = finish
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  useEffect(() => () => teardown.current?.(), [])

  return { drag, dragging, start }
}
