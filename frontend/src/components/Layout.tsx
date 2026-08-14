import { useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { NavDrawer } from './NavDrawer'
import {
  GearIcon,
  MenuIcon,
  PalmIcon,
  TrophyIcon,
  UsersIcon,
} from './icons'

// Primary destinations. On desktop they sit inline in the top bar; on phones
// they become a fixed bottom tab bar (thumb-reachable, can't overflow).
// Roster, votes and the weekly advantage play are one page now (#307), so
// there is a single weekly destination instead of three.
const PRIMARY = [
  { to: '/', label: 'My Season', Icon: PalmIcon, end: true },
  { to: '/standings', label: 'Standings', Icon: TrophyIcon, end: false },
  { to: '/cast', label: 'Cast', Icon: UsersIcon, end: false },
]

export function Layout() {
  const { session, profile } = useAuth()
  const authed = Boolean(session && profile)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const tabs =
    authed && profile?.is_admin
      ? [...PRIMARY, { to: '/admin', label: 'Admin', Icon: GearIcon, end: false }]
      : PRIMARY

  const topLink = ({ isActive }: { isActive: boolean }) =>
    `app-top-link inline-flex min-h-11 items-center rounded-lg px-2 text-sm transition-colors ${
      isActive
        ? 'bg-ember-50 text-ember-700 font-semibold'
        : 'text-gray-600 hover:bg-sand-100 hover:text-gray-900'
    }`

  return (
    <div className="app-shell min-h-screen bg-sand-50 text-gray-900">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[60] -translate-y-24 rounded-lg bg-ocean-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <div className="torch-stripe h-1" />
      <header className="app-header border-b border-sand-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <NavLink
            to="/"
            aria-label="Tribal Knowledge home"
            className="inline-flex min-h-11 shrink-0 items-center font-brand text-lg font-bold leading-none tracking-wide md:text-xl"
          >
            <span className="app-brand-primary text-ocean-700">TRIBAL</span>{' '}
            <span className="app-brand-secondary text-jungle-600">KNOWLEDGE</span>
          </NavLink>

          {authed && (
            <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
              {tabs.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} className={topLink}>
                  {label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-4">
            {authed ? (
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open menu"
                aria-haspopup="dialog"
                className="app-menu-button inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-ocean-700 transition-colors hover:bg-ocean-50 hover:text-ocean-900"
              >
                <MenuIcon />
              </button>
            ) : (
              <NavLink
                to="/login"
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-ocean-700 hover:bg-ocean-50"
              >
                Sign in
              </NavLink>
            )}
          </div>
        </div>
      </header>

      <main
        id="main-content"
        tabIndex={-1}
        className="app-main mx-auto max-w-6xl px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] focus:outline-none sm:px-6 md:py-10 md:pb-10 lg:px-8"
      >
        <Outlet />
      </main>

      {authed && (
        <nav
          aria-label="Primary navigation"
          className="app-bottom-nav fixed inset-x-0 bottom-0 z-30 flex border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(18,52,74,0.08)] backdrop-blur md:hidden"
        >
          {tabs.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `app-bottom-link flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 px-1 py-2 text-[11px] ${
                  isActive
                    ? 'text-ember-600 border-ember-500 font-semibold'
                    : 'text-gray-500 border-transparent'
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
      )}

      {authed && (
        <NavDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          returnFocusRef={menuButtonRef}
        />
      )}
    </div>
  )
}
