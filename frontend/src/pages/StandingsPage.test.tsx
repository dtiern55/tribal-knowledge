import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import { renderWithApp } from '../test/render'
import type { Season } from '../types'
import { StandingsPage } from './StandingsPage'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
  getActiveSeason: vi.fn(),
}))

describe('StandingsPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stays in its loading state until the active season and standings are ready', async () => {
    const season = { id: 'season-1', name: 'Survivor 51', status: 'active' } as Season
    let resolveSeason!: (season: Season) => void
    const seasonPending = new Promise<Season>((resolve) => {
      resolveSeason = resolve
    })
    vi.mocked(getActiveSeason).mockReturnValue(seasonPending)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons') return [season]
      if (path.endsWith('/standings')) return []
      throw new Error(`Unexpected path: ${path}`)
    })

    renderWithApp(<StandingsPage />)

    await waitFor(() => expect(getActiveSeason).toHaveBeenCalledOnce())
    expect(screen.queryByText('No season found')).not.toBeInTheDocument()

    resolveSeason(season)
    expect(await screen.findByRole('heading', { name: 'Standings' })).toBeVisible()
    expect(screen.getByText('No players yet')).toBeVisible()
  })

  it('shows one lit torch per active pick, without portraits or the points breakdown', async () => {
    const season = { id: 'season-1', name: 'Survivor 51', status: 'active' } as Season
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons') return [season]
      if (path.endsWith('/standings')) {
        return [{
          user_id: 'user-1',
          display_name: 'Danny',
          roster_points: 12,
          elimination_points: 15,
          finale_points: 0,
          total_points: 27,
          trend: null,
          trend_delta: 0,
          last_episode_points: 0,
          active_survivors: [
            { contestant_id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', tribe_color: '#7651a1', eliminated_episode: null },
            { contestant_id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', tribe_color: '#4ca56a', eliminated_episode: null },
          ],
          recently_eliminated_survivors: [],
        }]
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    renderWithApp(<StandingsPage />)

    const torches = await screen.findByRole('img', { name: '2 still in' })
    expect(torches.querySelectorAll('svg')).toHaveLength(2)
    expect(screen.queryByAltText('Kenzie')).not.toBeInTheDocument()
    // #437: the roster/ballot/finale breakdown moved to the detail page.
    expect(screen.queryByText(/Roster 12/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Ballot 15/)).not.toBeInTheDocument()
  })

  it('keeps a snuffed torch for a pick booted in the last scored episode (#457)', async () => {
    const season = { id: 'season-1', name: 'Survivor 51', status: 'active' } as Season
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons') return [season]
      if (path.endsWith('/standings')) {
        return [{
          user_id: 'user-1',
          display_name: 'Danny',
          roster_points: 12,
          elimination_points: 15,
          finale_points: 0,
          total_points: 27,
          trend: null,
          trend_delta: 0,
          last_episode_points: 0,
          active_survivors: [
            { contestant_id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', tribe_color: '#7651a1', eliminated_episode: null },
          ],
          recently_eliminated_survivors: [
            { contestant_id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', tribe_color: '#4ca56a', eliminated_episode: 4 },
          ],
        }]
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    renderWithApp(<StandingsPage />)

    const torches = await screen.findByRole('img', { name: '1 still in, lost Charlie this week' })
    const flames = torches.querySelectorAll('svg')
    expect(flames).toHaveLength(2)
    expect(flames[1].querySelector('.stroke-stone-600')).toBeInTheDocument()
    expect(flames[1].querySelector('.fill-stone-600')).toBeInTheDocument()
    expect(flames[1].querySelector('circle')).toHaveClass('fill-terracotta-600')
  })
})
