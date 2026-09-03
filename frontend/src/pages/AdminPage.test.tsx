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
  season_id: 'season-1',
  league_id: 'league-1',
  league_name: 'Snakes and Rats',
  name: 'Survivor 51',
  season_number: 51,
  status: 'active',
  roster_size: 5,
  roster_lock_episode: 2,
  merge_episode: 7,
  swap_token_cost: 20,
  free_swaps: 1,
  swap_penalty_step: -5,
  swap_penalty_floor: -25,
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
      if (path === '/leagues') {
        return [{ id: 'league-1', name: 'Snakes and Rats', join_code: 'test-code', member_count: 3, created_at: '2026-01-01' }]
      }
      if (path === '/league-seasons') return [season]
      if (path === '/leagues/league-1/members') {
        return [{ id: 'u-1', display_name: 'FINE', joined_at: '2026-01-02' }]
      }
      return []
    })

    renderWithApp(<AdminPage />, {
      auth: { profile: { id: 'admin-1', display_name: 'Admin', is_admin: true, leagues: [] } },
    })

    expect(await screen.findByRole('heading', { name: 'League operations' })).toBeVisible()
    // Leagues overview: who is in each league and where its seasons stand.
    expect(await screen.findByText('FINE')).toBeVisible()
    expect(screen.getByText(/active · Season setup/)).toBeVisible()
    // #404: swaps are priced in points now, not in the weekly play.
    expect(screen.getByText(/then -5\/swap escalating, floor -25/)).toBeVisible()
    expect(screen.queryByText(/weekly play/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Tokens/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/weekly token allocation/)).not.toBeInTheDocument()
  })

  it('requires explicit confirmation before publishing episode scores', async () => {
    const user = userEvent.setup()
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/episodes')) return [{ id: 'episode-1', season_id: season.id, episode_number: 2, air_date: '2026-08-01', max_elimination_picks: 3, is_finale: false, picks_lock_at: '2026-08-01T00:00:00Z', status: 'upcoming', created_at: '2026-08-01T00:00:00Z' }]
      if (path === '/leagues') return [{ id: 'league-1', name: 'Snakes and Rats', join_code: 'test-code', member_count: 3, created_at: '2026-01-01' }]
      return []
    })
    vi.mocked(api.post).mockResolvedValue({})

    renderWithApp(<AdminPage />, { auth: { profile: { id: 'admin-1', display_name: 'Admin', is_admin: true, leagues: [] } } })

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
      if (path === '/leagues') {
        return [{ id: 'league-1', name: 'Snakes and Rats', join_code: 'test-code', member_count: 3, created_at: '2026-01-01' }]
      }
      return []
    })
    vi.mocked(api.put).mockResolvedValue([])

    renderWithApp(<AdminPage />, {
      auth: { profile: { id: 'admin-1', display_name: 'Admin', is_admin: true, leagues: [] } },
    })
    await user.click(await screen.findByRole('button', { name: 'Manage' }))

    expect(await screen.findByText('Reveal Insights')).toBeVisible()
    await user.click(screen.getByLabelText(/Vote popularity: Kenzie/))
    await user.click(screen.getByLabelText(/Player vs league median/))
    await user.click(screen.getByLabelText(/Double Ballot Points usage/))
    expect(screen.getByText('3/3 added')).toBeVisible()
    expect(screen.getByLabelText(/Tribe Swap usage/)).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save reveal insights' }))

    expect(api.put).toHaveBeenCalledWith('/episodes/episode-1/insights', [
      { insight_type: 'pick_popularity', contestant_id: 'cast-1' },
      { insight_type: 'performance_vs_median' },
      { insight_type: 'weekly_play_usage', advantage_type: 'double_vote_points' },
    ])
    expect(await screen.findByText('Reveal insights saved.')).toBeVisible()
  })
})
