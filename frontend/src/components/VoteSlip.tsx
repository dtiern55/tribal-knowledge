/**
 * One submitted vote, as a clean chip: the castaway's name with a small ocean
 * dot. A stale vote (cast for someone already eliminated, #5) greys out and
 * strikes through.
 */
export function VoteSlip({
  name,
  stale = false,
}: {
  name: string
  stale?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${
        stale ? 'border-sand-300 bg-sand-50 text-gray-500' : 'border-sand-300 bg-white text-gray-800'
      }`}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${stale ? 'bg-gray-400' : 'bg-ocean-500'}`}
        aria-hidden
      />
      <span className={stale ? 'line-through' : undefined}>{name}</span>
    </span>
  )
}
