import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '../test/render'
import { api, getActiveSeason } from '../lib/api'
import type { AuthContextValue } from '../auth/context'
import type { Episode, Season } from '../types'
import { Layout } from './Layout'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn().mockResolvedValue([]) },
  getActiveSeason: vi.fn().mockResolvedValue(null),
  pinSeason: vi.fn(),
}))

vi.mock('../lib/install', () => ({
  installAvailable: () => false,
  isInstalled: () => true,
  isIos: () => false,
  onInstallAvailable: () => () => undefined,
  promptInstall: vi.fn(),
}))

function renderLayout(route = '/', auth?: Partial<AuthContextValue>) {
  return renderWithApp(
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<h1>Current page</h1>} />
        <Route path="standings" element={<h1>Standings page</h1>} />
      </Route>
    </Routes>,
    { route, auth },
  )
}

describe('Layout', () => {
  const season = {
    id: 'season-1',
    name: 'Review season',
    status: 'active',
    roster_lock_episode: 1,
  } as Season

  afterEach(() => {
    document.documentElement.classList.remove('locked-night')
    localStorage.removeItem('tribal-knowledge-shell-theme')
    localStorage.removeItem('tk-theme-override')
    document.querySelector('meta[name="theme-color"]')?.remove()
    // Restore the module defaults so a per-test override can't leak forward.
    vi.mocked(getActiveSeason).mockResolvedValue(null)
    vi.mocked(api.get).mockResolvedValue([])
  })

  it('provides skip navigation, a named main region, and matching primary destinations', () => {
    renderLayout('/standings')

    expect(screen.getByRole('link', { name: 'Tribal Knowledge home' })).toHaveTextContent(
      'TRIBALKNOWLEDGE',
    )
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main-content',
    )
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    const primaryNavs = screen.getAllByRole('navigation', { name: 'Primary navigation' })
    expect(primaryNavs).toHaveLength(2)
    for (const nav of primaryNavs) {
      expect(nav).toHaveTextContent('My Season')
      expect(nav).toHaveTextContent('Standings')
      expect(nav).toHaveTextContent('Cast')
    }
  })

  it('returns focus to the menu trigger after the drawer closes', async () => {
    const user = userEvent.setup()
    renderLayout()
    const trigger = screen.getByRole('button', { name: 'Open menu' })

    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('keeps the global night theme active while navigating a locked episode', async () => {
    const themeColor = document.createElement('meta')
    themeColor.name = 'theme-color'
    document.head.append(themeColor)
    // Stays locked across the mount fetch and the navigation re-fetch — the
    // shell re-derives its theme on every navigation now (persistent mock,
    // reset in afterEach).
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockResolvedValue([
      {
        id: 'episode-3',
        season_id: season.id,
        episode_number: 3,
        picks_lock_at: new Date(Date.now() - 60_000).toISOString(),
        status: 'upcoming',
      } as Episode,
    ])
    const user = userEvent.setup()
    renderLayout()

    await waitFor(() => expect(document.documentElement).toHaveClass('locked-night'))
    expect(themeColor).toHaveAttribute('content', '#0e1f19')
    expect(localStorage.getItem('tribal-knowledge-shell-theme')).toBe('locked')
    await user.click(screen.getAllByRole('link', { name: 'Standings' })[0])
    expect(await screen.findByRole('heading', { name: 'Standings page' })).toBeVisible()
    expect(document.documentElement).toHaveClass('locked-night')
  })

  it('preserves the last locked theme while authentication is restored', () => {
    document.documentElement.classList.add('locked-night')
    renderLayout('/', { session: null, profile: null, loading: true })

    expect(document.documentElement).toHaveClass('locked-night')
    expect(localStorage.getItem('tribal-knowledge-shell-theme')).toBe('locked')
  })

  it('lets an admin force night theme via the drawer, overriding the unlocked episode state', async () => {
    const user = userEvent.setup()
    renderLayout('/', { profile: { id: 'admin-1', display_name: 'Admin', is_admin: true } })

    await waitFor(() => expect(document.documentElement).not.toHaveClass('locked-night'))
    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(await screen.findByRole('button', { name: 'night' }))

    expect(document.documentElement).toHaveClass('locked-night')
    expect(localStorage.getItem('tk-theme-override')).toBe('night')
  })
})
