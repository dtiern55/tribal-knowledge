/** A compact gold label for the weekly play where it changed the field. */
export function PlayMark({
  text,
  title,
  dark = false,
  className = '',
}: {
  text: string
  title: string
  dark?: boolean
  className?: string
}) {
  return (
    <span
      className={`inline-flex shrink-0 rounded px-1 text-[10px] font-bold tabular-nums ${
        dark ? 'bg-gold-300 text-forest-900' : 'bg-gold-100 text-gold-700'
      } ${className}`}
      title={title}
      aria-label={title}
    >
      {text}
    </span>
  )
}

/**
 * One Hub ballot pick, using the same two-channel language as Standings:
 * gold means Power Vote; a fill means the pick was correct.
 */
export function HubBallotMark({
  name,
  power = false,
  correct = false,
  dark = false,
}: {
  name: string
  power?: boolean
  correct?: boolean
  dark?: boolean
}) {
  const tone = dark
    ? power
      ? correct
        ? 'border-gold-400 bg-gold-300/25 font-semibold text-gold-200'
        : 'border-dotted border-gold-400 text-gold-300'
      : correct
        ? 'border-jade-300 bg-jade-300/15 text-jade-100'
        : 'border-dotted border-white/30 text-white/60'
    : power
      ? correct
        ? 'border-gold-600 bg-gold-200 font-semibold text-gold-800'
        : 'border-dotted border-gold-500 text-gold-700'
      : correct
        ? 'border-jade-600 bg-jade-600/[.14] text-jade-800'
        : 'border-dotted border-stone-400 text-paper-ink-faded'

  return (
    <span
      title={power ? 'Power Vote on this vote' : undefined}
      className={`inline-flex items-center rounded-md border-[1.5px] px-2 py-0.5 text-sm ${tone}`}
    >
      {power && <span className="sr-only">Power Vote — </span>}
      {correct && <span className="sr-only">Correct — </span>}
      {name}
    </span>
  )
}
