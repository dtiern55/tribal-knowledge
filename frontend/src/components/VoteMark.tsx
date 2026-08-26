/**
 * A cast ballot: the parchment slip with a name scrawled across it, tilted a
 * degree off true — the same object the ballot panel is full of.
 *
 * It replaced a checkbox in a rounded rectangle, which read as a form control
 * from any app rather than as the thing you actually write a name on. The
 * scrawl rides the slip's own tilt and sits on its centre, and it is one
 * continuous stroke: two ruled lines just read as a form again, and at the
 * 18px the lane tab uses they thin out to a pair of dashes.
 */
export function VoteMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-mark="ballot"
    >
      <path d="M4.6 6.6 17.9 4.3l1.5 11.6-13.3 2.3z" />
      <g transform="rotate(-9.8 12 11.3)">
        <path d="M7.9 12.1c1.4-2.4 2.1-2.2 2.6.1.5 2.2 1.4 2.1 2.3-.2.8-2.1 1.7-1.9 2.8.2" />
      </g>
    </svg>
  )
}
