import { useEffect, useRef, useState } from 'react'
import { NavLink } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { api, getActiveSeason, pinSeason } from '../lib/api'
import {
  installAvailable,
  isInstalled,
  isIos,
  onInstallAvailable,
  promptInstall,
} from '../lib/install'
import type { Season } from '../types'
import {
  BookIcon,
  CloseIcon,
  DownloadIcon,
  EnvelopeIcon,
  GearIcon,
  LogOutIcon,
  ShareIcon,
  UserIcon,
} from './icons'

const rowCls =
  'flex items-center gap-3 w-full px-4 py-3 text-sm text-left text-gray-700 hover:bg-cream-100'

/** Slide-in navigation drawer (#219): the app-wide home for the season
 * switcher, account links, install, and sign out — reachable from the
 * top-bar menu button on every page. */
type ThemeOverride = 'auto' | 'day' | 'night'

export function NavDrawer({
  open,
  onClose,
  returnFocusRef,
  themeOverride,
  onThemeOverrideChange,
}: {
  open: boolean
  onClose: () => void
  returnFocusRef?: React.RefObject<HTMLElement | null>
  themeOverride?: ThemeOverride
  onThemeOverrideChange?: (value: ThemeOverride) => void
}) {
  const { signOut, profile } = useAuth()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [activeId, setActiveId] = useState('')
  const [canPrompt, setCanPrompt] = useState(installAvailable())
  const closeRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)

  useEffect(() => onInstallAvailable(() => setCanPrompt(true)), [])

  // Move focus into the drawer on open so keyboard users aren't left behind
  // the scrim. Keep focus inside until the modal drawer closes.
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      returnFocusRef?.current?.focus()
    }
  }, [open, onClose, returnFocusRef])

  // Load seasons + the current pick the first time the drawer opens.
  useEffect(() => {
    if (!open || seasons.length) return
    void Promise.all([api.get<Season[]>('/league-seasons'), getActiveSeason()]).then(
      ([ss, active]) => {
        setSeasons(ss)
        setActiveId(active?.id ?? '')
      },
    )
  }, [open, seasons.length])

  // Only name the league when there's more than one to tell apart (#595).
  const multiLeague = new Set(seasons.map((s) => s.league_id)).size > 1

  function changeSeason(id: string) {
    if (id === activeId) return
    pinSeason(id, seasons)
    // Every page reads the active season on mount; reloading makes the whole
    // app follow the pick. Switching seasons is rare, so a reload is fine.
    // ponytail: reload over a season context; revisit if switching gets hot.
    window.location.reload()
  }

  const showInstall = !isInstalled() && (canPrompt || isIos())

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-forest-900/40 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-label="Dismiss menu"
        aria-hidden={!open}
        disabled={!open}
        tabIndex={-1}
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
        inert={!open ? true : undefined}
        className={`fixed top-0 right-0 z-50 flex h-full w-80 max-w-[85vw] flex-col bg-cream-50 shadow-xl transition-transform duration-200 motion-reduce:transition-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-cream-200 px-4">
          <span className="font-display text-lg tracking-wide text-forest-800">Menu</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex size-11 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-cream-100 hover:text-gray-800"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-cream-200 p-4">
            <label
              htmlFor="drawer-season"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-forest-600"
            >
              {multiLeague ? 'League · Season' : 'Season'}
            </label>
            <select
              id="drawer-season"
              value={activeId}
              onChange={(e) => changeSeason(e.target.value)}
              className="w-full rounded-lg border border-forest-200 bg-white px-3 py-2 font-display tracking-wide text-forest-900"
            >
              {/* Active season first, then past seasons newest→oldest (#236). */}
              {[...seasons]
                .reverse()
                .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {multiLeague ? `${s.league_name} · ` : ''}
                    {s.name}
                    {s.status === 'active' ? ' (active)' : ''}
                  </option>
                ))}
            </select>
          </div>

          <nav aria-label="Account and help" className="py-1">
            <NavLink to="/rules" onClick={onClose} className={rowCls}>
              <BookIcon />
              Rules
            </NavLink>
            <div className={`${rowCls} cursor-default text-forest-800/55 hover:bg-transparent`}>
              <EnvelopeIcon />
              <span className="flex-1">Treemail</span>
              <span className="rounded-full bg-terracotta-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-terracotta-700">
                Soon
              </span>
            </div>
            <NavLink to="/profile" onClick={onClose} className={rowCls}>
              <UserIcon />
              Profile
            </NavLink>
            <NavLink to="/join" onClick={onClose} className={rowCls}>
              <UserIcon />
              Join a league
            </NavLink>
            <div className={`${rowCls} cursor-default text-forest-800/55 hover:bg-transparent`}>
              <GearIcon />
              <span className="flex-1">Settings</span>
              <span className="rounded-full bg-terracotta-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-terracotta-700">
                Soon
              </span>
            </div>
            {showInstall &&
              (canPrompt ? (
                <button type="button" onClick={() => void promptInstall()} className={rowCls}>
                  <DownloadIcon />
                  Install app
                </button>
              ) : (
                <div className="px-4 py-3 text-xs text-gray-500">
                  <span className="mb-0.5 flex items-center gap-3 text-gray-700">
                    <DownloadIcon />
                    Add to home screen
                  </span>
                  Tap{' '}
                  <span className="inline-flex items-center gap-1 font-medium">
                    Share <ShareIcon className="h-4 w-4" />
                  </span>
                  , then <span className="font-medium">Add to Home Screen</span>.
                </div>
              ))}
          </nav>

          {profile?.is_admin && onThemeOverrideChange && (
            <div className="border-t border-cream-200 p-4">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-forest-600">
                Testing
              </span>
              <div className="flex gap-2">
                {(['auto', 'day', 'night'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={themeOverride === option}
                    onClick={() => onThemeOverrideChange(option)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold capitalize transition-colors ${
                      themeOverride === option
                        ? 'border-terracotta-600 bg-terracotta-600 text-cream-50'
                        : 'border-forest-200 bg-white text-forest-700 hover:bg-cream-100'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-cream-200">
          <button
            type="button"
            onClick={() => void signOut()}
            className={`${rowCls} text-terracotta-700 hover:bg-terracotta-50`}
          >
            <LogOutIcon />
            Sign out
          </button>
          <p className="px-4 pb-3 text-[10px] text-gray-400">
            TV data from{' '}
            <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer" className="underline hover:text-gray-600">
              TVMaze
            </a>
          </p>
        </div>
      </aside>
    </>
  )
}
