import type { CSSProperties, ReactNode } from 'react'

/** One submitted vote, treated like a handwritten Tribal Council slip. */
export function VoteSlip({
  name,
  stale = false,
  tribeColor = null,
  rotation = 0,
  avatar,
}: {
  name: string
  stale?: boolean
  tribeColor?: string | null
  rotation?: number
  /** The castaway's portrait, set into the slip — you wrote a person's name
   *  down, so the slip shows the person (My Season redesign). */
  avatar?: ReactNode
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
      {avatar}
      <span className={stale ? 'line-through' : undefined}>{name}</span>
    </span>
  )
}
