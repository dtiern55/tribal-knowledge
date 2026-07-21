/**
 * Torch status glyph (#56): lit = still in the game, snuffed = voted out —
 * the Survivor snuffer motif that replaces the old red "OUT" stamp.
 *
 * Bold, portrait mark (flame + wood handle + ocean lashing) meant to read as
 * an actual torch at ~28px in the roster/cast leading column. Multicolour
 * fills, so it lives apart from the monochrome currentColor nav icons.
 */
export function Torch({
  lit,
  className = 'w-6 h-8',
}: {
  lit: boolean
  className?: string
}) {
  return (
    <svg viewBox="0 0 64 88" className={className} aria-hidden="true">
      {lit ? (
        <>
          <rect x="28" y="46" width="8" height="38" rx="2.5" fill="#b07a4a" />
          <path d="M30 50 v30 M34 50 v30" stroke="#8a5a34" strokeWidth="0.8" opacity=".5" />
          <path
            d="M23 47 C30 52 34 52 41 47 L41 53 C34 58 30 58 23 53 Z"
            fill="#1f7aa8"
          />
          <path
            d="M33 3 C26 16 42 18 35 29 C46 25 50 39 42 46 C38 51 26 51 22 45 C16 37 22 26 30 24 C34 18 31 10 33 3 Z"
            fill="#FFCB2E"
          />
          <path d="M19 40 C16 44 18 50 22 50 C20 46 23 42 19 40 Z" fill="#FFCB2E" />
          <path
            d="M33 26 C29 32 33 40 38 42 C34 48 25 45 26 36 C26 31 30 27 33 26 Z"
            fill="#F26A1B"
          />
        </>
      ) : (
        <>
          <rect x="28" y="46" width="8" height="38" rx="2.5" fill="#9a8a76" />
          <path d="M30 50 v30 M34 50 v30" stroke="#7d7060" strokeWidth="0.8" opacity=".5" />
          <path
            d="M23 47 C30 52 34 52 41 47 L41 53 C34 58 30 58 23 53 Z"
            fill="#9aa7ae"
          />
          <ellipse cx="32" cy="44" rx="8.5" ry="3" fill="#4a4038" />
          <path
            d="M25 44 l2 -4 M31 43 l0 -5 M37 44 l-1 -4"
            stroke="#3a332c"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M30 40 C34 34 27 31 31 25"
            stroke="#b6bcc0"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            opacity=".8"
          />
          <path
            d="M37 41 C40 36 35 33 38 28"
            stroke="#c7ccd0"
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
            opacity=".7"
          />
        </>
      )}
    </svg>
  )
}
