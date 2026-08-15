/**
 * One vote, written on a strip of parchment — the same torn strip as the
 * `VoteMark` ballot icon (#378), scaled behind live text so the name stays
 * selectable and reachable by a screen reader.
 */
export function VoteSlip({
  name,
  stale = false,
}: {
  name: string
  /** Voted for someone already eliminated — the vote no longer counts (#5). */
  stale?: boolean
}) {
  return (
    <span className={`vote-slip ${stale ? 'opacity-60' : ''}`}>
      <svg viewBox="0 0 64 40" preserveAspectRatio="none" aria-hidden="true">
        <path
          d="M5 4 L13 3 L21 4 L31 3 L41 4 L51 3 L59 5 L58 36 L50 37 L40 36 L30 38 L20 37 L11 38 L5 36 Z"
          fill={stale ? '#e2dccd' : '#ead7ad'}
          stroke={stale ? '#a09884' : '#8e6f42'}
          strokeWidth="1.7"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className={stale ? 'line-through' : undefined}>{name}</span>
    </span>
  )
}
