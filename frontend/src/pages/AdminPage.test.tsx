import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import type { Season } from '../types'
import { renderWithApp } from '../test/render'
import { AdminPage } from './AdminPage'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
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
  beforeEach(() => vi.clearAllMocks())

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

    expect(await screen.findByRole('heading', { name: 'League operations' })).toBeVisible()
    expect(screen.getByText(/later swaps use the weekly play/)).toBeVisible()
    expect(screen.queryByRole('heading', { name: /Tokens/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/weekly token allocation/)).not.toBeInTheDocument()
  })

  it('requires explicit confirmation before publishing episode scores', async () => {
    const user = userEvent.setup()
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/episodes')) return [{ id: 'episode-1', season_id: season.id, episode_number: 2, air_date: '2026-08-01', max_elimination_picks: 3, is_finale: false, picks_lock_at: '2026-08-01T00:00:00Z', status: 'upcoming', created_at: '2026-08-01T00:00:00Z' }]
      if (path === '/league-settings') return { id: 'settings-1', join_code: 'test-code', updated_at: '2026-01-01' }
      return []
    })
    vi.mocked(api.post).mockResolvedValue({})

    renderWithApp(<AdminPage />, { auth: { profile: { id: 'admin-1', display_name: 'Admin', is_admin: true } } })

    expect(await screen.findByRole('heading', { name: 'Episode 2 needs review' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Review and score episode' }))
    expect(api.post).not.toHaveBeenCalledWith('/episodes/episode-1/score', {})
    expect(screen.getByText(/reveals results to the league/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Score and publish results' }))
    expect(api.post).toHaveBeenCalledWith('/episodes/episode-1/score', {})
  })

  it('lets the commissioner curate up to three scored-episode insights', async () => {
    const user = userEvent.setup()
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/contestants')) {
        return [{ id: 'cast-1', name: 'Kenzie', image_url: null }]
      }
      if (path.endsWith('/episodes')) {
        return [{
          id: 'episode-1',
          season_id: season.id,
          episode_number: 2,
          air_date: '2026-08-01',
          max_elimination_picks: 3,
          is_finale: false,
          picks_lock_at: '2026-08-01T00:00:00Z',
          status: 'scored',
          created_at: '2026-08-01T00:00:00Z',
        }]
      }
      if (path.endsWith('/eliminations')) {
        return [{ id: 'elim-1', contestant_id: 'cast-1', elimination_type: 'voted_out' }]
      }
      if (path.endsWith('/insights') || path.endsWith('/scoring-events')) return []
      if (path === '/league-settings') {
        return { id: 'settings-1', join_code: 'test-code', updated_at: '2026-01-01' }
      }
      return []
    })
    vi.mocked(api.put).mockResolvedValue([])

    renderWithApp(<AdminPage />, {
      auth: { profile: { id: 'admin-1', display_name: 'Admin', is_admin: true } },
    })
    await user.click(await screen.findByRole('button', { name: 'Manage' }))

    expect(await screen.findByText('Reveal Insights')).toBeVisible()
    await user.click(screen.getByLabelText(/Pick popularity: Kenzie/))
    await user.click(screen.getByLabelText(/Player vs league median/))
    await user.click(screen.getByLabelText(/Double Vote Points usage/))
    expect(screen.getByText('3/3 selected')).toBeVisible()
    expect(screen.getByLabelText(/Roster Swap usage/)).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save reveal insights' }))

    expect(api.put).toHaveBeenCalledWith('/episodes/episode-1/insights', [
      { insight_type: 'pick_popularity', contestant_id: 'cast-1' },
      { insight_type: 'performance_vs_median' },
      { insight_type: 'weekly_play_usage', advantage_type: 'double_vote_points' },
    ])
    expect(await screen.findByText('Reveal insights saved.')).toBeVisible()
  })
})
