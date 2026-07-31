import { useState } from 'react'

/**
 * Section header (title · optional right slot · chevron). Collapsible sections
 * persist their open/closed choice per section. The weekly essentials — Weekly
 * Votes and My Roster — pass `collapsible={false}`: they're the reason you
 * opened the page, so there's nothing to gain from minimising them.
 */
export function SectionShell({
  title,
  right,
  defaultOpen = true,
  prominent = false,
  collapsible = true,
  children,
}: {
  title: string
  right?: React.ReactNode
  defaultOpen?: boolean
  prominent?: boolean
  collapsible?: boolean
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
  const shown = collapsible ? open : true
  const label = (
    <span
      className={`text-xs font-semibold uppercase tracking-wide ${
        prominent ? 'text-ocean-800' : 'text-gray-500'
      }`}
    >
      {title}
    </span>
  )
  const bar = `w-full flex items-center gap-2 pl-2 border-l-2 ${shown ? 'mb-3' : ''} ${
    prominent ? 'border-ocean-500' : 'border-ember-500'
  }`
  return (
    <div>
      {/* Heading wraps the toggle (h2 > button) so sections sit correctly
          under the page h1 and episode h3s below don't skip a level. */}
      <h2>
        {collapsible ? (
          <button onClick={toggle} aria-expanded={open} className={bar}>
            {label}
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
        ) : (
          <div className={bar}>
            {label}
            {right}
          </div>
        )}
      </h2>
      {shown && children}
    </div>
  )
}
