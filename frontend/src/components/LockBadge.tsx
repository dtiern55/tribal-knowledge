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

const base =
  'inline-flex items-center gap-1 text-[11px] uppercase tracking-wide px-2 py-1 rounded font-semibold'

/** On a coloured card band the chip is the band's own text, not a pill on top
 *  of it — and the full "Aug 29, 8:24 PM CT" crowds the title out, so a distant
 *  lock shortens to its date. */
const onBandBase = 'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.04em]'

function shortCentral(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
  })
}

/** The stamped "Locked" chip — LockBadge's terminal state, used on its own
 * where the lock is a rule rather than a deadline (advantages, swaps). */
function LockedBadge({ onBand = false }: { onBand?: boolean }) {
  return (
    <span className={onBand ? `${onBandBase} text-white/85` : `${base} bg-gray-800 text-cream-100`}>
      <LockGlyph /> Locked
    </span>
  )
}

/** Live lock-state chip (#56): calm while distant, amber inside a day,
 * ember pulse in the final hour, a stamped "Locked" after. */
export function LockBadge({
  lockAt,
  scored,
  onBand = false,
}: {
  lockAt: string | null
  scored?: boolean
  /** Render for a coloured card band — see {@link onBandBase}. */
  onBand?: boolean
}) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (!lockAt) return null
  const ms = new Date(lockAt).getTime() - Date.now()

  if (scored || ms <= 0) return <LockedBadge onBand={onBand} />
  const mins = Math.floor(ms / 60_000)
  if (mins < 60) {
    return (
      <span
        className={
          onBand
            ? `${onBandBase} animate-pulse text-white`
            : `${base} bg-terracotta-100 text-terracotta-700 animate-pulse`
        }
      >
        <LockGlyph /> Locks in {mins}m
      </span>
    )
  }
  if (mins < 24 * 60) {
    return (
      <span className={onBand ? `${onBandBase} text-white` : `${base} bg-gold-100 text-gold-700`}>
        <LockGlyph /> Locks in {Math.floor(mins / 60)}h
      </span>
    )
  }
  return (
    <span className={onBand ? `${onBandBase} text-white/85` : `${base} bg-cream-100 text-gray-600`}>
      <LockGlyph /> Locks {onBand ? shortCentral(lockAt) : formatCentral(lockAt)}
    </span>
  )
}
