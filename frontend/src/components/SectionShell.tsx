import { useState } from 'react'

/**
 * Collapsible section header (title · optional right slot · chevron) with the
 * open/closed choice persisted per section. Weekly Votes and My Roster open by
 * default and get the ocean accent (the weekly essentials); Season Predictions
 * and Advantages collapse to a quiet row.
 */
export function SectionShell({
  title,
  right,
  defaultOpen = true,
  prominent = false,
  children,
}: {
  title: string
  right?: React.ReactNode
  defaultOpen?: boolean
  prominent?: boolean
  children: React.ReactNode
}) {
  const storageKey = `mytribe.section.${title}`
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return saved == null ? defaultOpen : saved === '1'
  })
  function toggle() {
    setOpen((o) => {
      localStorage.setItem(storageKey, o ? '0' : '1')
      return !o
    })
  }
  return (
    <div>
      {/* Heading wraps the toggle (h2 > button) so sections sit correctly
          under the page h1 and episode h3s below don't skip a level. */}
      <h2>
      <button
        onClick={toggle}
        aria-expanded={open}
        className={`w-full flex items-center gap-2 pl-2 border-l-2 ${open ? 'mb-3' : ''} ${
          prominent ? 'border-ocean-500' : 'border-ember-500'
        }`}
      >
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${
            prominent ? 'text-ocean-800' : 'text-gray-500'
          }`}
        >
          {title}
        </span>
        {right}
        <svg
          viewBox="0 0 24 24"
          className={`ml-auto w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      </h2>
      {open && children}
    </div>
  )
}
