/** A Survivor vote: one handwritten name on a short strip of parchment. */
export function VoteMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} aria-hidden="true" data-mark="ballot">
      <path
        d="M5 4 L13 3 L21 4 L31 3 L41 4 L51 3 L59 5 L58 36 L50 37 L40 36 L30 38 L20 37 L11 38 L5 36 Z"
        fill="#ead7ad"
        stroke="#8e6f42"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M13 24 C17 9 22 34 29 20 C35 7 40 34 51 17"
        fill="none"
        stroke="#263128"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
