// Inline nav icons (#106): emoji rendered inconsistently across phones.
// Primary navigation uses loose Survivor-specific drawings in the same
// round-stroke language as the original palm. Utility controls retain familiar
// conventional symbols. No icon dependency.

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
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
    <Svg>
      <path d="M6 22c.2-2.7.7-5.7 1-8.8M12 22c-.3-5.3.2-10.4 0-16M18 22c-.3-4-.6-7.1-1-10.6" />
      <path d="m5.7 15.5 1.9-.5m-1.7 2 1.6-.5M11 9l2 .2m-2 1.3 2 .2m3.3 3.3 2-.5m-1.8 2 1.7-.5" />
      <path d="M7 12c-2-1.5.4-2.9.1-4.8 1.6 1.1 2.2 2.8.7 4.5M12 5c-2.2-1.7.5-3.1.2-4.7 1.8 1.3 2.3 3.1.6 4.5M17 10.5c-1.9-1.5.4-2.8.2-4.5 1.5 1.2 2.1 2.7.6 4.2" />
    </Svg>
  )
}

export function BuffPairIcon() {
  return (
    <Svg>
      <path d="M3.5 8.2c0-3.2 1.7-5.1 4.3-5.1 2.8 0 4.6 2 4.4 5.2-.1 2.8-1.8 4.7-4.4 4.7-2.5 0-4.4-1.9-4.3-4.8Z" />
      <path d="M3.8 6.4c2.7-.8 5.4-.7 8.2.1M4.1 6.1 2.3 5m1.9 1.5-1.8.8" />
      <path d="M1.5 22c.2-4.8 2.6-7.4 6.4-7.4 2.5 0 4.4 1.1 5.5 3" />
      <path d="M14.2 8c0-2.9 1.4-4.7 3.7-4.7 2.5 0 4 1.9 4 4.7 0 2.7-1.5 4.4-3.9 4.4-2.3 0-3.8-1.7-3.8-4.4Z" />
      <path d="M16.5 3.4c-.2-1.1.5-1.9 1.5-1.9s1.8.8 1.6 1.9" />
      <path d="m15.2 12.6.4 3 2.5 1.6 2.4-1.6.3-3-2.8 1.3Z" />
      <path d="M12.2 21.8c.2-3.6 2.2-5.5 5.8-5.5 3.2 0 4.7 1.8 4.8 5.5" />
    </Svg>
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
