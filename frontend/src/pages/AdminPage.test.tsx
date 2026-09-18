import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { Season } from '../types'
import { renderWithApp } from '../test/render'
import { AdminPage } from './AdminPage'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  api: {
    get: vi.fn(), patch: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(),
    // The writes that name what they changed go through the quiet set (#816),
    // so a test asserting on `api.post` is also asserting it stayed loud.
    quiet: { post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  },
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

  it('previews every unlocked and locked loading-screen texture', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/leagues') {
        return [{ id: 'league-1', name: 'Snakes and Rats', join_code: 'test-code', member_count: 3, created_at: '2026-01-01' }]
      }
      if (path === '/league-seasons') return [season]
      return []
    })

    renderWithApp(<AdminPage />, {
      auth: { profile: { id: 'admin-1', display_name: 'Admin', is_admin: true, leagues: [] } },
    })

    await user.click(await screen.findByRole('button', { name: 'Preview loading screen' }))
    for (const name of ['Current', 'Teak', 'Woven', 'Stone']) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }
    await user.click(screen.getByRole('button', { name: 'Teak' }))
    expect((await screen.findByLabelText('Loading')).innerHTML).toContain('/wood-teak-dark.webp?v=20260915')

    await user.click(screen.getByRole('button', { name: 'locked' }))
    for (const name of ['Current', 'Alder', 'Birch / Alder', 'Birch / Maple', 'Maple', 'Charred', 'Walnut', 'Weathered']) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }
    expect(screen.queryByRole('button', { name: 'Teak' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Birch / Alder' }))
    expect(screen.getByLabelText('Loading').innerHTML).toContain('/wood-alder.webp?v=20260915')
    await user.click(screen.getByRole('button', { name: 'Birch / Maple' }))
    expect(screen.getByLabelText('Loading').innerHTML).toContain('/wood-maple.webp?v=20260915')
  })

  it('requires explicit confirmation before publishing episode scores', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons') return [season]
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

  it('re-reads only the ledger a scoring event touched (#816)', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons') return [season]
      if (path === '/leagues') return [{ id: 'league-1', name: 'Snakes and Rats', join_code: 'test-code', member_count: 1, created_at: '2026-01-01' }]
      if (path.endsWith('/contestants')) return [{ id: 'cast-1', name: 'Kenzie', image_url: null }]
      if (path.endsWith('/scoring-event-types')) return [{ event_type: 'individual_immunity', label: 'Individual immunity', point_value: 5 }]
      if (path.endsWith('/episodes')) {
        return [{ id: 'episode-1', season_id: season.season_id, episode_number: 2, air_date: '2026-08-01', max_elimination_picks: 3, is_finale: false, picks_lock_at: '2026-08-01T00:00:00Z', status: 'upcoming', created_at: '2026-08-01T00:00:00Z' }]
      }
      return []
    })
    vi.mocked(api.quiet.post).mockResolvedValue([{ id: 'ev-1', contestant_id: 'cast-1', event_type: 'individual_immunity', quantity: 1 }])

    renderWithApp(<AdminPage />, {
      auth: { profile: { id: 'admin-1', display_name: 'Admin', is_admin: true, leagues: [] } },
    })
    // The episode under review opens with the panel already expanded.
    const castSelect = (await screen.findByRole('option', { name: 'Contestant…' })).closest('select')!
    await user.selectOptions(castSelect, 'cast-1')

    // A night at the console is dozens of these. Before the write names what it
    // changes, each one refetched every league, every cast and every schedule.
    vi.mocked(api.get).mockClear()
    await user.click(screen.getByRole('button', { name: '+ Add' }))

    await waitFor(() =>
      expect(api.quiet.post).toHaveBeenCalledWith('/episodes/episode-1/scoring-events', [
        { contestant_id: 'cast-1', event_type: 'individual_immunity', quantity: 1 },
      ]),
    )
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/episodes/episode-1/scoring-events'))
    expect([...new Set(vi.mocked(api.get).mock.calls.map(([path]) => path))]).toEqual([
      '/episodes/episode-1/scoring-events',
    ])
  })

  it('lets the commissioner curate up to three scored-episode insights', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons') return [season]
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
    vi.mocked(api.quiet.put).mockResolvedValue([])

    renderWithApp(<AdminPage />, {
      auth: { profile: { id: 'admin-1', display_name: 'Admin', is_admin: true, leagues: [] } },
    })
    await user.click(await screen.findByRole('button', { name: 'Manage' }))

    expect(await screen.findByText('Reveal Insights')).toBeVisible()
    await user.click(screen.getByLabelText(/Vote popularity: Kenzie/))
    await user.click(screen.getByLabelText(/Player vs league median/))
    await user.click(screen.getByLabelText(/Power Vote usage/))
    expect(screen.getByText('3/3 added')).toBeVisible()
    expect(screen.getByLabelText(/Tribe Swap usage/)).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save reveal insights' }))

    expect(api.quiet.put).toHaveBeenCalledWith('/episodes/episode-1/insights', [
      { insight_type: 'pick_popularity', contestant_id: 'cast-1' },
      { insight_type: 'performance_vs_median' },
      { insight_type: 'weekly_play_usage', advantage_type: 'double_vote_points' },
    ])
    expect(await screen.findByText('Reveal insights saved.')).toBeVisible()
  })
})

describe('AdminPage access', () => {
  beforeEach(() => vi.clearAllMocks())

  it('tells a non-admin the page is not theirs, not that it failed to load', async () => {
    // `/leagues` is admin-only, so this is what the server actually answers a
    // non-admin — the refusal the page used to report as an outage (#820).
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/leagues') throw new Error('Administrator access required')
      if (path === '/league-seasons') return [season]
      return []
    })

    renderWithApp(<AdminPage />, {
      auth: { profile: { id: 'user-1', display_name: 'Player', is_admin: false, leagues: [] } },
    })

    expect(await screen.findByText('Commissioner access required')).toBeVisible()
    // The 403 still lands; the refusal must survive it rather than be replaced
    // by the load-failure notice one render later.
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/leagues'))
    expect(screen.queryByText('Could not load commissioner tools')).not.toBeInTheDocument()
  })
})
