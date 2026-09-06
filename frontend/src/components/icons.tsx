import castMask from '../assets/cast-icon-mask.png'
import palmMask from '../assets/icon-palm-mask.webp'
import torchMask from '../assets/icon-torch-mask.webp'
import tallyMask from '../assets/icon-tally-mask.webp'

// Inline nav icons (#106): emoji rendered inconsistently across phones.
// Primary navigation uses custom Survivor-specific drawings. Utility controls
// retain familiar conventional symbols. No icon dependency.

/**
 * A painted icon: an alpha mask filled with `currentColor` (#552).
 *
 * The Cast buffs were the only icon drawn this way and they were the only ones
 * that read at 20px, because a solid mass with a bitten edge survives the
 * downscale where a 2px outline turns to wire. The rest of the primary set now
 * matches: same technique, same weight, and they still take the nav's colour.
 *
 * `size` is the mask's own scale inside the box. The Cast mask carries more
 * margin than the generated ones, so it needs 128% where they sit at 100%.
 */
function MaskIcon({
  src,
  size = '100%',
  className = 'w-5 h-5',
}: {
  src: string
  size?: string
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`${className} inline-block`}
      style={{
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskSize: size,
        maskSize: size,
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
      }}
    />
  )
}

function Svg({
  children,
  className = 'w-5 h-5',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function PalmIcon() {
  return <MaskIcon src={palmMask} />
}

export function RankedTorchesIcon() {
  return <MaskIcon src={torchMask} />
}

export function BuffPairIcon() {
  return <MaskIcon src={castMask} size="128%" />
}

export function BookIcon() {
  return (
    <Svg>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </Svg>
  )
}

export function GearIcon() {
  return (
    <Svg>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

export function MenuIcon() {
  return (
    <Svg>
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </Svg>
  )
}

export function CloseIcon() {
  return (
    <Svg>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Svg>
  )
}

export function UserIcon() {
  return (
    <Svg>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  )
}

export function DownloadIcon() {
  return (
    <Svg>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </Svg>
  )
}

export function ShareIcon({ className }: { className?: string } = {}) {
  return (
    <Svg className={className}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <path d="m16 6-4-4-4 4" />
      <path d="M12 2v13" />
    </Svg>
  )
}

export function LogOutIcon() {
  return (
    <Svg>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  )
}

/** The My Team lane's Survivor-specific mark: two castaways wearing buffs. */
export function TeamBuffPairIcon({ className = 'w-5 h-5' }: { className?: string } = {}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5.5 6.8c.2-2.5 1.7-4.1 4-4.1 2.5 0 4.1 1.7 4 4.3-.1 2.4-1.6 4.1-4 4.2-2.3.1-4.2-1.7-4-4.4Z" />
      <path d="M5.8 6.2c2.2-.7 4.8-.7 7.4 0M6.6 4.8l-2-.7" />
      <path d="M2.5 21c0-4.2 2.7-6.8 6.8-6.8 4.4 0 7 2.4 7.2 6.8" />
      <path d="M15.2 3.6c2.6-.5 4.7 1.2 4.8 3.8.1 2.1-1.2 3.7-3.3 4.3M16 5.5c1.3-.4 2.6-.4 3.8.1M18 14.7c2.4.8 3.6 2.8 3.5 6.3" />
    </svg>
  )
}

/**
 * Season history — days scratched off, the way a camp counts them.
 *
 * It replaced a clock with an arrow around it, which is the stock history
 * glyph on every app ever built. A tally says the same thing in the show's own
 * hand, and collides with nothing else in the set: torches are Standings,
 * buffs are the Cast and your Tribe, a written slip is the Ballot.
 *
 * Three strokes and a slash rather than four and a slash: at the 18px the
 * card actually uses, the fourth closes the gaps and the group turns to mush.
 */
export function HistoryIcon({ className }: { className?: string } = {}) {
  return <MaskIcon src={tallyMask} className={className ?? 'w-5 h-5'} />
}

/** Disclosure arrow for a row that opens something. */
export function ChevronRightIcon({ className }: { className?: string } = {}) {
  return (
    <Svg className={className}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  )
}
