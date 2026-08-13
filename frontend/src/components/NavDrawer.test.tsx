import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import type { Season } from '../types'
import { renderWithApp } from '../test/render'
import { NavDrawer } from './NavDrawer'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
  getActiveSeason: vi.fn(),
  pinSeason: vi.fn(),
}))

vi.mock('../lib/install', () => ({
  installAvailable: () => false,
  isInstalled: () => true,
  isIos: () => false,
  onInstallAvailable: () => () => undefined,
  promptInstall: vi.fn(),
}))

const season = {
  id: 'season-1',
  name: 'Survivor 51',
  status: 'active',
} as Season

describe('NavDrawer', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue([season])
    vi.mocked(getActiveSeason).mockResolvedValue(season)
  })

  it('renders authenticated routed content from deterministic API responses and closes accessibly', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithApp(<NavDrawer open onClose={onClose} />, { route: '/rules' })

    expect(await screen.findByRole('option', { name: 'Survivor 51 (active)' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('removes a closed drawer from the accessibility tree', () => {
    renderWithApp(<NavDrawer open={false} onClose={() => undefined} />)

    expect(screen.queryByRole('dialog', { name: 'Menu' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Rules' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss menu' })).not.toBeInTheDocument()
  })
})
