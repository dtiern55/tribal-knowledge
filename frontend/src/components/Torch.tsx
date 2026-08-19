/** A slender carved Survivor torch. Lit means active; snuffed means voted out. */
export function Torch({
  lit,
  className = 'w-6 h-8',
}: {
  lit: boolean
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 48 96"
      className={className}
      aria-hidden="true"
      data-state={lit ? 'lit' : 'snuffed'}
    >
      {lit ? (
        <>
          <path
            d="M25 3 C20 10 23 15 19 21 C16 26 18 31 24 33 C30 32 33 28 31 23 C30 18 27 16 28 10 C25 13 26 7 25 3 Z"
            fill="#e66e22"
            stroke="#a94418"
            strokeWidth=".8"
            data-part="flame"
          />
          <path
            d="M24 19 C21 23 22 28 25 30 C28 27 27 23 25 20 Z"
            fill="#f6c843"
            data-part="flame-core"
          />
        </>
      ) : (
        <>
          <path
            d="M21 31 C17 24 25 21 21 14"
            fill="none"
            stroke="#9ba6a8"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity=".8"
            data-part="smoke"
          />
          <path
            d="M28 31 C32 25 25 22 29 17"
            fill="none"
            stroke="#9ba6a8"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity=".8"
            data-part="smoke"
          />
          <ellipse cx="24" cy="34" rx="5" ry="2.3" fill="#292623" stroke="#161514" />
        </>
      )}

      <path
        d="M17 25 L21 22 L23 31 L24 35 L22 41 L19 36 Z"
        fill="#6d492f"
        stroke="#33251c"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M31 25 L27 22 L25 31 L24 35 L26 41 L29 36 Z"
        fill="#6d492f"
        stroke="#33251c"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M19 40 L29 40 L29 93 L19 93 Z"
        fill={lit ? '#95653e' : '#74685a'}
        stroke={lit ? '#493322' : '#4f4941'}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M19 29 L21 27 M29 29 L27 27"
        fill="none"
        stroke={lit ? '#d0a069' : '#a99d8e'}
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M22 44 C28 50 20 56 26 62 C29 66 21 72 26 78 C28 81 24 85 22 89 M26 44 C20 50 28 56 22 62 C19 66 27 72 22 78 C20 81 24 85 26 89"
        fill="none"
        stroke={lit ? '#2e211a' : '#48423b'}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
