import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
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
  CloseIcon,
  DownloadIcon,
  EnvelopeIcon,
  GearIcon,
  LogOutIcon,
  UserIcon,
} from './icons'

const rowCls =
  'flex items-center gap-3 w-full px-4 py-3 text-sm text-left text-gray-700 hover:bg-sand-100'

/** Slide-in navigation drawer (#219): the app-wide home for the season
 * switcher, account links, install, and sign out — reachable from the
 * top-bar menu button on every page. */
export function NavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, signOut } = useAuth()
  const [seasons, setSeasons] = useState<Season[]>([])
  const [activeId, setActiveId] = useState('')
  const [canPrompt, setCanPrompt] = useState(installAvailable())
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => onInstallAvailable(() => setCanPrompt(true)), [])

  // Move focus into the drawer on open so keyboard users aren't left behind
  // the scrim. ponytail: focus-in + Esc, no full focus trap — a nav menu
  // doesn't warrant one; add if it grows into a real modal flow.
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  // Load seasons + the current pick the first time the drawer opens.
  useEffect(() => {
    if (!open || seasons.length) return
    void Promise.all([api.get<Season[]>('/seasons'), getActiveSeason()]).then(
      ([ss, active]) => {
        setSeasons(ss)
        setActiveId(active?.id ?? '')
      },
    )
  }, [open, seasons.length])

  // Esc closes.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ocean-900/40 transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`fixed top-0 right-0 z-50 flex h-full w-80 max-w-[85vw] flex-col bg-sand-50 shadow-xl transition-transform duration-200 motion-reduce:transition-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-sand-200 px-4">
          <span className="font-display text-lg tracking-wide text-ocean-800">Menu</span>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close menu"
            className="text-gray-500 hover:text-gray-800"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-sand-200 p-4">
            <label
              htmlFor="drawer-season"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ocean-600"
            >
              Season
            </label>
            <select
              id="drawer-season"
              value={activeId}
              onChange={(e) => changeSeason(e.target.value)}
              className="w-full rounded-lg border border-ocean-200 bg-white px-3 py-2 font-display tracking-wide text-ocean-900"
            >
              {seasons
                .slice()
                .reverse()
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.status === 'active' ? ' (active)' : ''}
                  </option>
                ))}
            </select>
          </div>

          <nav className="py-1">
            <div className={`${rowCls} cursor-default text-gray-400 hover:bg-transparent`}>
              <EnvelopeIcon />
              <span className="flex-1">Treemail</span>
              <span className="rounded border border-sand-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                Soon
              </span>
            </div>
            <Link to="/profile" onClick={onClose} className={rowCls}>
              <UserIcon />
              {profile?.display_name ?? 'Profile'}
            </Link>
            <div className={`${rowCls} cursor-default text-gray-400 hover:bg-transparent`}>
              <GearIcon />
              <span className="flex-1">Settings</span>
              <span className="rounded border border-sand-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                Soon
              </span>
            </div>
            {showInstall &&
              (canPrompt ? (
                <button onClick={() => void promptInstall()} className={rowCls}>
                  <DownloadIcon />
                  Install app
                </button>
              ) : (
                <div className="px-4 py-3 text-xs text-gray-500">
                  <span className="mb-0.5 flex items-center gap-3 text-gray-700">
                    <DownloadIcon />
                    Add to home screen
                  </span>
                  In Safari, tap <span className="font-medium">Share</span> →{' '}
                  <span className="font-medium">Add to Home Screen</span>.
                </div>
              ))}
          </nav>
        </div>

        <div className="border-t border-sand-200">
          <button
            onClick={() => void signOut()}
            className={`${rowCls} text-ember-700 hover:bg-ember-50`}
          >
            <LogOutIcon />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
