import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { api, getActiveSeason } from '../lib/api'
import { resolveMySeasonState } from '../lib/mySeasonState'
import type { Episode } from '../types'
import { NavDrawer } from './NavDrawer'
import {
  BuffPairIcon,
  GearIcon,
  MenuIcon,
  PalmIcon,
  RankedTorchesIcon,
} from './icons'

// Primary destinations. On desktop they sit inline in the top bar; on phones
// they become a fixed bottom tab bar (thumb-reachable, can't overflow).
// Roster, votes and the weekly advantage play are one page now (#307), so
// there is a single weekly destination instead of three.
const PRIMARY = [
  { to: '/', label: 'My Season', Icon: PalmIcon, end: true },
  { to: '/standings', label: 'Standings', Icon: RankedTorchesIcon, end: false },
  { to: '/cast', label: 'Cast', Icon: BuffPairIcon, end: false },
]

export function Layout() {
  const { session, profile, loading: authLoading } = useAuth()
  const authed = Boolean(session && profile)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [nightMode, setNightMode] = useState(() =>
    document.documentElement.classList.contains('locked-night'),
  )
  // Admin-only testing affordance (#468): forces the shell theme without a
  // real locked episode. 'auto' defers to nightMode as derived above.
  const [themeOverride, setThemeOverride] = useState<'auto' | 'day' | 'night'>(
    () => (localStorage.getItem('tk-theme-override') as 'auto' | 'day' | 'night') || 'auto',
  )
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  // Re-derive the shell theme on every navigation, not just on the 30s poll.
  // Pages fetch their own lock state fresh on mount, so without this the shell
  // could lag behind the page you just landed on after a lock flips — leaving
  // the chrome one theme and the content the other until a refresh.
  const { pathname } = useLocation()
  const tabs =
    authed && profile?.is_admin
      ? [...PRIMARY, { to: '/admin', label: 'Admin', Icon: GearIcon, end: false }]
      : PRIMARY

  useEffect(() => {
    let live = true

    async function refreshEpisodeTheme() {
      if (authLoading) return
      if (!authed) {
        if (live) setNightMode(false)
        return
      }
      try {
        const season = await getActiveSeason()
        if (!season) {
          if (live) setNightMode(false)
          return
        }
        const episodes = await api.get<Episode[]>(`/seasons/${season.id}/episodes`)
        if (live) setNightMode(resolveMySeasonState(season, episodes).kind === 'locked')
      } catch {
        // A page-level error handles failed data loads. Keep the last known
        // shell theme instead of flashing between day and night.
      }
    }

    void refreshEpisodeTheme()
    const timer = window.setInterval(() => void refreshEpisodeTheme(), 30_000)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [authed, authLoading, pathname])

  // The Admin console follows the app's locked/unlocked state like every other
  // page (#519): the night overrides now cover its surfaces, so the commissioner
  // sees the same firelight the league does while scoring a locked episode. The
  // override still forces day/night here for testing.
  const effectiveNight = themeOverride === 'auto' ? nightMode : themeOverride === 'night'

  useEffect(() => {
    document.documentElement.classList.toggle('locked-night', effectiveNight)
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', effectiveNight ? '#0e1f19' : '#1e3a2f')
    try {
      localStorage.setItem('tribal-knowledge-shell-theme', effectiveNight ? 'locked' : 'day')
    } catch {
      // Storage can be unavailable in private browsing; the live theme still works.
    }
    return () => document.documentElement.classList.remove('locked-night')
  }, [effectiveNight])

  useEffect(() => {
    try {
      localStorage.setItem('tk-theme-override', themeOverride)
    } catch {
      // Storage can be unavailable in private browsing; the override still applies for this session.
    }
  }, [themeOverride])

  const topLink = ({ isActive }: { isActive: boolean }) =>
    `app-top-link inline-flex min-h-11 items-center rounded-lg px-2 text-sm transition-colors ${
      isActive
        ? 'bg-terracotta-600 text-cream-50 font-semibold'
        : 'text-stone-300 hover:bg-forest-500 hover:text-cream-50'
    }`

  return (
    <div className="app-shell bg-cream-100 text-ink">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-[60] -translate-y-24 rounded-lg bg-forest-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <header className="app-header border-b border-forest-700 bg-forest-600 text-cream-50">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <NavLink
            to="/"
            aria-label="Snakes and Rats home"
            className="inline-flex min-h-11 shrink-0 items-center font-brand text-xl font-bold leading-none tracking-wide md:text-2xl"
          >
            <span className="app-brand-primary mr-1.5 text-cream-50">SNAKES</span>
            <span className="mr-1.5 text-gold-300">AND</span>
            <span className="app-brand-secondary text-terracotta-500">RATS</span>
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
                className="app-menu-button inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-cream-50 transition-colors hover:bg-forest-500 hover:text-white"
              >
                <MenuIcon />
              </button>
            ) : (
              <NavLink
                to="/login"
                className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-cream-50 hover:bg-forest-500"
              >
                Sign in
              </NavLink>
            )}
          </div>
        </div>
      </header>
      <div className="tribal-border" aria-hidden="true" />

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
          className="app-bottom-nav fixed inset-x-0 bottom-0 z-30 flex border-t border-forest-700 bg-forest-600/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_18px_rgba(30,58,47,0.18)] backdrop-blur md:hidden"
        >
          {tabs.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `app-bottom-link flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 border-t-2 px-1 py-2 text-[11px] ${
                  isActive
                    ? 'text-terracotta-200 border-terracotta-500 font-semibold'
                    : 'text-stone-300 border-transparent'
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
          themeOverride={themeOverride}
          onThemeOverrideChange={setThemeOverride}
        />
      )}
    </div>
  )
}
