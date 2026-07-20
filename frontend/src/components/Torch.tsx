/**
 * Torch status glyph (#56): lit = still in the game, snuffed = voted out —
 * the Survivor snuffer motif that replaces the old red "OUT" stamp.
 *
 * Multicolour filled mark (ember flame / ash smoke), so it lives apart from
 * the monochrome currentColor nav icons in icons.tsx.
 *
 * ponytail: only the snuffed state is wired up so far (RosterCard, CastPage);
 * the lit variant is here for the contestant page header when that gets its pass.
 */
export function Torch({
  lit,
  className = 'w-4 h-4',
}: {
  lit: boolean
  className?: string
}) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {lit ? (
        <>
          <path
            d="M12 2.2 C10.7 4.6 13.3 5.3 12.1 7.5 C14.1 6.6 15.2 8.7 14.3 10.5 C13.6 12 11.6 12.2 10.5 11 C9.4 9.8 10.2 7.2 11.6 6.5 C12.4 5.1 12.7 3.6 12 2.2 Z"
            fill="#e37b33"
          />
          <rect x="10.8" y="11" width="2.4" height="10" rx="1" fill="#b07a4a" />
          <path
            d="M9.4 12.2 C11 13.2 13 13.2 14.6 12.2 L14.6 13.9 C13 14.9 11 14.9 9.4 13.9 Z"
            fill="#1f7aa8"
          />
        </>
      ) : (
        <>
          <path
            d="M12 3 C13 3.9 13 5 12.1 5.9 C11.2 6.8 11.2 7.8 12.1 8.7"
            stroke="#9aa0a6"
            strokeWidth="1.3"
            fill="none"
            strokeLinecap="round"
          />
          <rect x="10.8" y="9.5" width="2.4" height="11.5" rx="1" fill="#9a8a76" />
          <ellipse cx="12" cy="9.4" rx="2.1" ry="1.1" fill="#514a42" />
          <path
            d="M9.4 12 C11 13 13 13 14.6 12 L14.6 13.7 C13 14.7 11 14.7 9.4 13.7 Z"
            fill="#a9a29a"
          />
        </>
      )}
    </svg>
  )
}
