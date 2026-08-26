import castMask from '../assets/cast-icon-mask.png'

// Inline nav icons (#106): emoji rendered inconsistently across phones.
// Primary navigation uses custom Survivor-specific drawings. Utility controls
// retain familiar conventional symbols. No icon dependency.

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
  return (
    <Svg>
      <path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4" />
      <path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3" />
      <path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35" />
      <path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14" />
    </Svg>
  )
}

export function RankedTorchesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="w-5 h-5"
      aria-hidden="true"
    >
      <path d="M5 7.6c1.3 1.6 1.9 2.8 1.9 3.9 0 1.3-.8 2.2-1.9 2.2s-1.9-.9-1.9-2.2c0-1.1.6-2.3 1.9-3.9z" />
      <rect x="2.9" y="14.4" width="4.2" height="2.2" rx="1" />
      <rect x="4.1" y="17.2" width="1.8" height="4.8" rx="0.9" />
      <path d="M12 .6c1.3 1.6 1.9 2.8 1.9 3.9 0 1.3-.8 2.2-1.9 2.2s-1.9-.9-1.9-2.2c0-1.1.6-2.3 1.9-3.9z" />
      <rect x="9.9" y="7.4" width="4.2" height="2.2" rx="1" />
      <rect x="11.1" y="10.2" width="1.8" height="11.8" rx="0.9" />
      <path d="M19 4.6c1.3 1.6 1.9 2.8 1.9 3.9 0 1.3-.8 2.2-1.9 2.2s-1.9-.9-1.9-2.2c0-1.1.6-2.3 1.9-3.9z" />
      <rect x="16.9" y="11.4" width="4.2" height="2.2" rx="1" />
      <rect x="18.1" y="14.2" width="1.8" height="7.8" rx="0.9" />
    </svg>
  )
}

export function BuffPairIcon() {
  return (
    <span
      aria-hidden="true"
      className="w-5 h-5 inline-block"
      style={{
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${castMask})`,
        maskImage: `url(${castMask})`,
        WebkitMaskSize: '128%',
        maskSize: '128%',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
      }}
    />
  )
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

export function EnvelopeIcon() {
  return (
    <Svg>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
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

export function LogOutIcon() {
  return (
    <Svg>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  )
}

/** The Roster lane's mark (My Season redesign): a team, not a person. */
export function PeopleIcon({ className }: { className?: string } = {}) {
  return (
    <Svg className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  )
}

/** The Ballot lane's mark: a marked slip. */
export function BallotIcon({ className }: { className?: string } = {}) {
  return (
    <Svg className={className}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8.5 11.5l2.5 2.5 4.5-5.5" />
    </Svg>
  )
}

/** Season history — a clock turned back. */
export function HistoryIcon({ className }: { className?: string } = {}) {
  return (
    <Svg className={className}>
      <path d="M3 3v5h5" />
      <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
      <path d="M12 7v5l4 2" />
    </Svg>
  )
}

/** Disclosure arrow for a row that opens something. */
export function ChevronRightIcon({ className }: { className?: string } = {}) {
  return (
    <Svg className={className}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  )
}
