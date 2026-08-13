import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import type { Season } from '../types'
import { renderWithApp } from '../test/render'
import { AdminPage } from './AdminPage'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getActiveSeason: vi.fn(),
}))

const season = {
  id: 'season-1',
  name: 'Survivor 51',
  season_number: 51,
  status: 'active',
  roster_size: 5,
  roster_lock_episode: 2,
  merge_episode: 7,
  swap_token_cost: 20,
  free_swaps: 1,
  max_swaps: 3,
  ss_lock_episode: null,
  swap_lock_episode: 10,
  advantage_lock_episode: 12,
  weekly_token_allocation: 0,
  token_economy_enabled: false,
  elimination_pick_schedule: [],
  created_at: '2026-01-01T00:00:00Z',
} as Season

describe('AdminPage current rules', () => {
  it('does not expose token-era settings or scoring copy', async () => {
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-settings') {
        return { id: 'settings-1', join_code: 'test-code', updated_at: '2026-01-01' }
      }
      return []
    })

    renderWithApp(<AdminPage />, {
      auth: { profile: { id: 'admin-1', display_name: 'Admin', is_admin: true } },
    })

    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeVisible()
    expect(screen.getByText(/later swaps use the weekly play/)).toBeVisible()
    expect(screen.queryByRole('heading', { name: /Tokens/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/weekly token allocation/)).not.toBeInTheDocument()
  })
})
