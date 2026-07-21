/**
 * Vote imagery (#56): a name written on parchment IS the Survivor vote — so
 * the ballot uses quill-and-parchment instead of fire (fire now means a
 * castmember's life in the game, per the torch/idol).
 *
 *  - default: quill writing on a sheet — the act of casting, for the buttons.
 *  - sealed:  a wax-sealed scroll — locked, for the "ballot locked" confirmations.
 */
export function VoteMark({
  sealed = false,
  className = 'w-6 h-6',
}: {
  sealed?: boolean
  className?: string
}) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {sealed ? (
        <>
          <rect x="14" y="20" width="36" height="24" rx="3" fill="#F3E6C8" stroke="#d8c39a" strokeWidth="1.5" />
          <ellipse cx="14" cy="32" rx="5" ry="12" fill="#e8d6ad" stroke="#d8c39a" strokeWidth="1.5" />
          <ellipse cx="50" cy="32" rx="5" ry="12" fill="#e8d6ad" stroke="#d8c39a" strokeWidth="1.5" />
          <path d="M24 28 h16 M24 36 h12" stroke="#7a6a4a" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="32" cy="44" r="7" fill="#c0391b" />
          <path d="M29 44 l2 2 4 -4" stroke="#F3E6C8" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path d="M16 8 L44 8 L48 12 L48 56 L16 56 Z" fill="#F3E6C8" stroke="#d8c39a" strokeWidth="1.5" />
          <path d="M44 8 L44 12 L48 12 Z" fill="#d8c39a" />
          <path d="M22 22 h18 M22 30 h20 M22 38 h14" stroke="#7a6a4a" strokeWidth="2" strokeLinecap="round" />
          <path d="M50 50 L34 34 C40 30 46 32 50 38 C52 42 52 47 50 50 Z" fill="#d5621b" />
          <path d="M34 34 L30 30" stroke="#0E5A86" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
