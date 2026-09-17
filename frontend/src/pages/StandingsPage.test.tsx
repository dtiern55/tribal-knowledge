import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    // The snuffed torch is the traced smoke-and-ember drawing, not the flame.
    expect(flames[1].querySelector('path[fill="url(#torch-ember)"]')).not.toBeNull()
    expect(flames[1].querySelector('title')?.textContent).toBe('Charlie, eliminated ep 4')
  })

  it('flies the Sole Survivor first as the red champion flame, not doubled among the votives (#164)', async () => {
    const season = { id: 'season-1', name: 'Survivor 51', status: 'active' } as Season
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons') return [season]
      if (path.endsWith('/standings')) {
        return [{
          user_id: 'user-1', display_name: 'Danny',
          roster_points: 0, elimination_points: 0, finale_points: 0, total_points: 0,
          trend: null, trend_delta: 0, last_episode_points: 0,
          active_survivors: [
            { contestant_id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: null, tribe_color: null, eliminated_episode: null },
            { contestant_id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: null, tribe_color: null, eliminated_episode: null },
          ],
          recently_eliminated_survivors: [],
          sole_survivor_contestant_id: 'cast-2',
        }]
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    renderWithApp(<StandingsPage />)

    const torches = await screen.findByRole('img', { name: '2 still in' })
    const flames = torches.querySelectorAll('svg')
    expect(flames).toHaveLength(2) // the champion is not also drawn as a votive
    // Charlie leads as the red champion flame; Kenzie is a gold votive.
    expect(flames[0].querySelector('path[fill="url(#torch-champion)"]')).not.toBeNull()
    expect(flames[0].querySelector('title')?.textContent).toBe('Charlie, your Sole Survivor')
    expect(flames[1].querySelector('path[fill="url(#torch-heart)"]')).not.toBeNull()
    expect(flames[1].querySelector('title')?.textContent).toBe('Kenzie')
  })

  it('snuffs the champion from the other side when the Sole Survivor is voted out (#164)', async () => {
    const season = { id: 'season-1', name: 'Survivor 51', status: 'active' } as Season
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons') return [season]
      if (path.endsWith('/standings')) {
        return [{
          user_id: 'user-1', display_name: 'Danny',
          roster_points: 0, elimination_points: 0, finale_points: 0, total_points: 0,
          trend: null, trend_delta: 0, last_episode_points: 0,
          active_survivors: [
            { contestant_id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: null, tribe_color: null, eliminated_episode: null },
          ],
          recently_eliminated_survivors: [
            { contestant_id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: null, tribe_color: null, eliminated_episode: 11 },
          ],
          sole_survivor_contestant_id: 'cast-2',
        }]
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    renderWithApp(<StandingsPage />)

    const torches = await screen.findByRole('img', { name: '1 still in, lost Charlie this week' })
    const flames = torches.querySelectorAll('svg')
    expect(flames).toHaveLength(2)
    // The champion's smoke is mirrored — snuffed from the other side.
    expect(flames[0].querySelector('g[transform*="scale(-1 1)"]')).not.toBeNull()
    expect(flames[0].querySelector('title')?.textContent).toBe('Charlie, your Sole Survivor, eliminated ep 11')
  })
  // The season behind the expansion tests: episodes 1 and 2 locked and scored,
  // Danny holding Charlie (his Sole Survivor, voted out in ep 2), Ben (swapped
  // in for ep 2) and Q (snuffed back in ep 1 and never swapped out). Kenzie was
  // swapped out after ep 1. `plays` is what the week's advantage was.
  const EXPANSION_SEASON = {
    id: 'season-1', season_id: 'show-1', name: 'Survivor 51',
    status: 'active', roster_lock_episode: 1,
  } as Season

  function mockExpansionApi(plays: unknown[]) {
    const locked = new Date(Date.now() - 86_400_000).toISOString()
    vi.mocked(getActiveSeason).mockResolvedValue(EXPANSION_SEASON)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons') return [EXPANSION_SEASON]
      if (path.endsWith('/standings')) {
        return [{
          user_id: 'user-1', display_name: 'Danny',
          roster_points: 40, elimination_points: 20, finale_points: 0, total_points: 60,
          trend: null, trend_delta: 0, last_episode_points: 40,
          active_survivors: [], recently_eliminated_survivors: [],
        }]
      }
      if (path === '/seasons/show-1/episodes') {
        return [
          { id: 'ep-1', episode_number: 1, is_finale: false, status: 'scored', picks_lock_at: locked },
          { id: 'ep-2', episode_number: 2, is_finale: false, status: 'scored', picks_lock_at: locked },
        ]
      }
      if (path === '/seasons/show-1/contestants') {
        return [
          { id: 'cast-1', name: 'Charlie', image_url: null, tribe_name: null, tribe_color: null, eliminated_in_episode: 2 },
          { id: 'cast-2', name: 'Kenzie', image_url: null, tribe_name: null, tribe_color: null, eliminated_in_episode: null },
          { id: 'cast-3', name: 'Ben', image_url: null, tribe_name: null, tribe_color: null, eliminated_in_episode: null },
          { id: 'cast-4', name: 'Q', image_url: null, tribe_name: null, tribe_color: null, eliminated_in_episode: 1 },
        ]
      }
      if (path === '/seasons/show-1/eliminations') {
        return [
          { id: 'el-1', episode_id: 'ep-1', contestant_id: 'cast-4', is_final: true },
          { id: 'el-2', episode_id: 'ep-2', contestant_id: 'cast-1', is_final: true },
        ]
      }
      if (path.endsWith('/roster/user-1')) {
        return [
          { id: 'rp-1', contestant_id: 'cast-1', active_from_episode: 1, active_until_episode: null, is_sole_survivor: true },
          { id: 'rp-2', contestant_id: 'cast-2', active_from_episode: 1, active_until_episode: 1, is_sole_survivor: false },
          { id: 'rp-3', contestant_id: 'cast-3', active_from_episode: 2, active_until_episode: null, is_sole_survivor: false },
          { id: 'rp-4', contestant_id: 'cast-4', active_from_episode: 1, active_until_episode: null, is_sole_survivor: false },
        ]
      }
      if (path.endsWith('/picks/user-1')) {
        return { 'ep-2': [{ id: 'pk-1', contestant_id: 'cast-1', episode_id: 'ep-2', rank: 1 }] }
      }
      if (path.endsWith('/advantage-plays/user-1')) return plays
      throw new Error(`Unexpected path: ${path}`)
    })
  }

  async function expandDanny() {
    renderWithApp(<StandingsPage />)
    const row = await screen.findByRole('button', { name: /Danny/ })
    expect(row).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(row)
    return row
  }

  it("expands a row into that player's latest week: tribe and votes (#806)", async () => {
    mockExpansionApi([
      { id: 'ap-1', episode_id: 'ep-2', advantage_type: 'double_vote_points', target_contestant_id: 'cast-1' },
    ])

    await expandDanny()

    // Only the latest locked episode.
    expect(await screen.findByText('Ep 2')).toBeVisible()
    expect(screen.queryByText('Ep 1')).not.toBeInTheDocument()

    const [team, voted] = screen.getAllByRole('definition')
    // The tribe as it stood that week: Ben swapped in, Kenzie swapped out after
    // ep 1, and Q — snuffed back in ep 1 and never swapped out — gone, the same
    // life as the snuffed torch in the row above.
    expect(team).toHaveTextContent('Charlie')
    expect(team).toHaveTextContent('Ben')
    expect(team).not.toHaveTextContent('Kenzie')
    expect(team).not.toHaveTextContent('Q')
    expect(screen.getByTitle('Swapped in this episode')).toBeVisible()
    // Their vote hit — Charlie went home — and the idol rides that vote
    // rather than sitting on a "Played" line of its own.
    expect(voted).toHaveTextContent('Correct — Charlie')
    expect(voted).toContainElement(screen.getByRole('img', { name: 'Power Vote' }))
    expect(screen.queryByText('Played')).not.toBeInTheDocument()

    expect(screen.getByRole('link', { name: /Danny's full team page/ })).toHaveAttribute(
      'href',
      '/league-seasons/season-1/team/user-1',
    )
  })

  it('rides the idol on the castaway whose points were doubled (#806)', async () => {
    mockExpansionApi([
      { id: 'ap-2', episode_id: 'ep-2', advantage_type: 'double_roster_points', target_contestant_id: 'cast-3' },
    ])

    await expandDanny()

    const [team, voted] = screen.getAllByRole('definition')
    const idol = screen.getByRole('img', { name: /Double Castaway Points/ })
    expect(team).toContainElement(idol)
    // Ben's chip, not Charlie's — and nothing on the ballot this week.
    expect(idol.parentElement).toHaveTextContent('Ben')
    expect(voted).not.toContainElement(idol)
  })
})
