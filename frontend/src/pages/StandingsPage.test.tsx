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

  it('draws the places moved inside the movement triangle, left of the rank (#808)', async () => {
    const season = { id: 'season-1', name: 'Survivor 51', status: 'active' } as Season
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    const player = (display_name: string, total_points: number, trend: string | null, trend_delta: number) => ({
      user_id: display_name, display_name, roster_points: total_points, elimination_points: 0,
      finale_points: 0, total_points, trend, trend_delta, last_episode_points: 0,
      active_survivors: [], recently_eliminated_survivors: [],
    })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons') return [season]
      if (path.endsWith('/standings')) {
        return [player('Climber', 30, 'up', 12), player('Slipper', 20, 'down', 1), player('Steady', 10, 'same', 0)]
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    renderWithApp(<StandingsPage />)

    const climb = await screen.findByLabelText('Up 12 since last episode')
    expect(climb).toHaveTextContent('12')
    expect(screen.getByLabelText('Down 1 since last episode')).toHaveTextContent('1')
    // A row that didn't move shows no triangle at all — its rank still lines
    // up, because the slot beside the number is held either way.
    expect(screen.getAllByLabelText(/since last episode/)).toHaveLength(2)
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
  // and the league Hub for episode 2 — Danny holding Charlie (his Sole
  // Survivor, voted out that episode), Ben and Tiff. Kenzie and Q are not on
  // the week's tribe: swapped out after ep 1, and snuffed back in ep 1.
  // `play` is what the week's advantage was.
  const EXPANSION_SEASON = {
    id: 'season-1', season_id: 'show-1', name: 'Survivor 51',
    status: 'active', roster_lock_episode: 1,
  } as Season

  function mockExpansionApi(play: Record<string, unknown>) {
    const locked = new Date(Date.now() - 86_400_000).toISOString()
    const cast = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
      contestant_id: id, name, image_url: null, tribe_name: null, tribe_color: null,
      eliminated_episode: null, points: null, correct: null, ...extra,
    })
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
      if (path === '/league-seasons/season-1/episodes/ep-2/hub') {
        return [{
          user_id: 'user-1', display_name: 'Danny',
          roster: [
            cast('cast-1', 'Charlie', { points: 12, eliminated_episode: 2 }),
            cast('cast-3', 'Ben', { points: 24 }),
            cast('cast-5', 'Tiff', { points: 0 }),
          ],
          ballot: [
            // Their Power Vote named Charlie, who went home; Kenzie didn't.
            cast('cast-1', 'Charlie', { correct: true }),
            cast('cast-2', 'Kenzie', { correct: false }),
          ],
          sole_survivor_contestant_id: 'cast-1',
          finale: null, tribe_points: 36, ballot_points: 20, ...play,
        }]
      }
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
    mockExpansionApi({ advantage_type: 'double_vote_points', advantage_target: { contestant_id: 'cast-1', name: 'Charlie', image_url: null, tribe_name: null, tribe_color: null, eliminated_episode: null } })

    await expandDanny()

    // Only the latest locked episode.
    expect(await screen.findByText('Ep 2')).toBeVisible()
    expect(screen.queryByText('Ep 1')).not.toBeInTheDocument()

    const [tribe, voted] = screen.getAllByRole('definition')
    // The tribe as it stood that week, with what each castaway scored.
    expect(tribe).toHaveTextContent('Charlie')
    expect(tribe).toHaveTextContent('Ben')
    expect(tribe).not.toHaveTextContent('Kenzie')
    expect(tribe).toHaveTextContent('+12')
    expect(tribe).toHaveTextContent('+24')
    // Gold is the Power Vote and a filled card is a hit: Charlie's vote is the
    // gold one and it landed, the miss is dotted and neutral. Never an ×2 —
    // the Power Vote is its own rung, not a multiplier.
    const marked = screen.getByTitle('Power Vote on this vote')
    expect(marked).toHaveTextContent('Charlie')
    expect(marked.className).toContain('bg-gold-200')
    expect(voted).toContainElement(marked)
    expect(voted).not.toHaveTextContent('×2')
    expect(screen.getByText('Kenzie').className).toContain('border-dotted')

    expect(screen.getByRole('link', { name: /Danny's full team page/ })).toHaveAttribute(
      'href',
      '/league-seasons/season-1/team/user-1',
    )
  })

  it('marks the castaway whose points were doubled with a ×2 (#806)', async () => {
    mockExpansionApi({ advantage_type: 'double_roster_points', advantage_target: { contestant_id: 'cast-3', name: 'Ben', image_url: null, tribe_name: null, tribe_color: null, eliminated_episode: null } })

    await expandDanny()

    const [tribe, voted] = screen.getAllByRole('definition')
    const mark = await screen.findByLabelText('Double Castaway Points on them this episode')
    expect(tribe).toContainElement(mark)
    expect(mark.parentElement).toHaveTextContent('Ben')
    // Ben's 24 paid double, so the line reads 48 — the ×2 says why — and the
    // number is gold like the mark beside it, not jade.
    expect(mark.parentElement).toHaveTextContent('+48')
    expect(tribe).not.toHaveTextContent('+24')
    expect(screen.getByText('+48').className).toContain('text-gold-700')
    // Charlie wasn't doubled, so his stays as scored, in jade.
    expect(screen.getByText('+12').className).toContain('text-jade-700')
    expect(voted).not.toContainElement(mark)
  })
})
