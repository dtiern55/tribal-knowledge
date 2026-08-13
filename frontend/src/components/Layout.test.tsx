import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { renderWithApp } from '../test/render'
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

function renderLayout(route = '/') {
  return renderWithApp(
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<h1>Current page</h1>} />
        <Route path="standings" element={<h1>Standings page</h1>} />
      </Route>
    </Routes>,
    { route },
  )
}

describe('Layout', () => {
  it('provides skip navigation, a named main region, and matching primary destinations', () => {
    renderLayout('/standings')

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
})
