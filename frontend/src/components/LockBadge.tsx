import { useEffect, useState } from 'react'
import { formatCentral } from '../lib/time'

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

/** Live lock-state chip (#56): calm while distant, amber inside a day,
 * ember pulse in the final hour, a stamped "Locked" after. */
export function LockBadge({ lockAt, scored }: { lockAt: string | null; scored?: boolean }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (!lockAt) return null
  const ms = new Date(lockAt).getTime() - Date.now()
  const base =
    'inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold'

  if (scored || ms <= 0) {
    return (
      <span className={`${base} bg-gray-800 text-sand-100`}>
        <LockGlyph /> Locked
      </span>
    )
  }
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) {
    return (
      <span className={`${base} bg-ember-100 text-ember-700 animate-pulse`}>
        <LockGlyph /> Locks in {mins}m
      </span>
    )
  }
  if (mins < 24 * 60) {
    return (
      <span className={`${base} bg-amber-100 text-amber-700`}>
        <LockGlyph /> Locks in {Math.floor(mins / 60)}h
      </span>
    )
  }
  return (
    <span className={`${base} bg-sand-100 text-gray-500`}>
      <LockGlyph /> Locks {formatCentral(lockAt)}
    </span>
  )
}
