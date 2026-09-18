import { AdvantageStamp } from './DoubleBadge'

/**
 * One Hub ballot pick. A fill means the pick was correct; the Power Vote is
 * the idol stamped on its corner (#849), not a colour of its own.
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
    ? correct
      ? 'border-jade-300 bg-jade-300/30 font-semibold text-jade-50'
      : 'border-white/25 text-white/60'
    : correct
      ? 'border-jade-600 bg-jade-600/[.22] font-semibold text-jade-800'
      : 'border-stone-300 text-paper-ink-faded'
  return (
    <span className={`relative inline-flex items-center rounded-md border-[1.5px] px-2 py-0.5 text-sm ${tone}`}>
      {correct && <span className="sr-only">Correct — </span>}
      {name}
      {power && <AdvantageStamp size={16} title="Power Vote on this vote" dark={dark} />}
    </span>
  )
}
