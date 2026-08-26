import { useEffect, useState } from 'react'
import { lockPhrase } from '../lib/time'

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}

const base =
  'inline-flex items-center gap-1 text-[11px] uppercase tracking-wide px-2 py-1 rounded font-semibold'

/** Re-render every 30s so a countdown actually counts down. */
function useLockTick() {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
}

/**
 * The lock as a line of running text rather than a chip — for the hero, where
 * a pill would be a second object on a card that is already one statement.
 * Carries `data-lock` so its surface can colour the urgency itself.
 */
export function LockLine({ lockAt }: { lockAt: string }) {
  useLockTick()
  const { state, text } = lockPhrase(lockAt)
  if (state === 'locked') return <span data-lock={state}>locked</span>
  return (
    <span data-lock={state}>
      locks {text}
    </span>
  )
}

/** The stamped "Locked" chip — LockBadge's terminal state, used on its own
 * where the lock is a rule rather than a deadline (advantages, swaps). */
function LockedBadge() {
  return (
    <span className={`${base} bg-gray-800 text-cream-100`}>
      <LockGlyph /> Locked
    </span>
  )
}

/** Live lock-state chip (#56): calm while distant, amber inside a day,
 * ember pulse in the final hour, a stamped "Locked" after. */
export function LockBadge({ lockAt, scored }: { lockAt: string | null; scored?: boolean }) {
  useLockTick()
  if (!lockAt) return null
  const { state, text } = lockPhrase(lockAt, scored)

  if (state === 'locked') return <LockedBadge />
  const tone =
    state === 'imminent'
      ? 'bg-terracotta-100 text-terracotta-700 animate-pulse'
      : state === 'soon'
        ? 'bg-gold-100 text-gold-700'
        : 'bg-cream-100 text-gray-600'
  return (
    <span className={`${base} ${tone}`}>
      <LockGlyph /> Locks {text}
    </span>
  )
}
