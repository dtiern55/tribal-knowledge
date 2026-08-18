/** A cast ballot — a clean slip with a check, matching the app's line icons. */
export function VoteMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-mark="ballot"
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8.5 11.5l2.5 2.5 4.5-5.5" />
    </svg>
  )
}
