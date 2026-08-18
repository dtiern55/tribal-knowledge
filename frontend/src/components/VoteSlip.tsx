import type { CSSProperties } from 'react'

/** One submitted vote, treated like a handwritten Tribal Council slip. */
export function VoteSlip({
  name,
  stale = false,
  tribeColor = null,
  rotation = 0,
}: {
  name: string
  stale?: boolean
  tribeColor?: string | null
  rotation?: number
}) {
  return (
    <span
      className={`ballot-slip ${stale ? 'ballot-slip--stale' : ''}`}
      style={
        {
          '--ballot-tribe-color': tribeColor ?? 'var(--color-gold-500)',
          '--ballot-rotation': `${rotation}deg`,
        } as CSSProperties
      }
    >
      <span className={stale ? 'line-through' : undefined}>{name}</span>
    </span>
  )
}
