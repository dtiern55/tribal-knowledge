/**
 * The Sole Survivor mark everywhere but Standings: a filled hand torch.
 *
 * Four broad shapes survive the 12 x 16px render used by the locked episode
 * field: flame, hot core, basket, and handle. This is intentionally separate
 * from the Standings votive, whose flame-only silhouette has a different job.
 */
export function SoleSurvivorTorch({
  className = 'h-4 w-3 shrink-0',
  snuffed = false,
}: {
  className?: string
  /** Voted out: an ash bed and a curl of smoke where the flame was. */
  snuffed?: boolean
}) {
  return (
    <svg
      viewBox="0 0 16 24"
      className={`sole-survivor-torch ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {snuffed ? (
        <>
          {/* A drawn snuff rather than a greyed flame, so it still reads as a torch. */}
          <path
            d="M8 8.6c-.9-1.2.9-2.1 0-3.4S7.1 3 8 1.6"
            fill="none"
            stroke="#8a847c"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
          <path
            d="M4.6 10.2c.5-1.3 1.9-1.9 3.4-1.9s2.9.6 3.4 1.9Z"
            fill="#5b5550"
            stroke="#3f2117"
            strokeWidth=".8"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          {/* A dark keyline keeps the flame intact on cream and torchlit surfaces. */}
          <path
            d="M8.1.8c.7 2.5 3.8 3.4 3.8 6.7 0 2.6-1.7 4.5-3.9 4.5S4.1 10.1 4.1 7.5c0-1.6.8-2.8 1.9-3.9-.1 1.3.4 2.3 1.1 2.8.2-1.9-.2-3.9 1-5.6Z"
            fill="#e85d2a"
            stroke="#542819"
            strokeWidth=".8"
            strokeLinejoin="round"
          />
          <path
            d="M8.2 5.2c.4 1.2 1.6 1.7 1.6 2.9 0 1.2-.7 2-1.8 2s-1.8-.8-1.8-2c0-.7.4-1.3.9-1.8.1.7.3 1.1.7 1.4 0-.9 0-1.7.4-2.5Z"
            fill="#ffe6a3"
          />
        </>
      )}
      {/* One solid basket and one band read more clearly than woven detail. */}
      <path
        d="M4.2 10.2h7.6l-1.1 3.5H5.3l-1.1-3.5Z"
        fill="#a95732"
        stroke="#542819"
        strokeWidth=".8"
        strokeLinejoin="round"
      />
      <rect x="3.7" y="9.8" width="8.6" height="1.7" rx=".7" fill="#f2b94b" />
      <path
        d="M6.3 13.2h3.4L9 23H7l-.7-9.8Z"
        fill="#66351f"
        stroke="#3f2117"
        strokeWidth=".8"
        strokeLinejoin="round"
      />
      <path d="m6.7 16.1 2.7-1 .1 1.7-2.7 1-.1-1.7Z" fill="#f2b94b" />
    </svg>
  )
}
