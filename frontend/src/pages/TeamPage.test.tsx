import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { api } from '../lib/api'
import { renderWithApp } from '../test/render'
import type { Contestant, ContestantPerformance, Episode, RosterPick, StandingEntry } from '../types'
import { TeamPage } from './TeamPage'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
}))

describe('TeamPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('expands another player roster row instead of linking to the cast page', async () => {
    const player: StandingEntry = {
      user_id: 'friend-1',
      display_name: 'Friend',
      roster_points: 12,
      elimination_points: 0,
      finale_points: 0,
      total_points: 12,
      trend: null,
      trend_delta: 0,
      last_episode_points: 12,
      active_survivors: [],
      recently_eliminated_survivors: [],
      sole_survivor_contestant_id: null,
    }
    const contestant = {
      id: 'cast-1',
      name: 'Kenzie',
      image_url: null,
      tribe_name: 'Yanu',
      tribe_color: '#7651a1',
      eliminated_in_episode: null,
    } as Contestant
    const roster = [{
      id: 'roster-1',
      contestant_id: contestant.id,
      active_from_episode: 2,
      active_until_episode: null,
      is_sole_survivor: false,
    }] as RosterPick[]
    const performance = {
      name: contestant.name,
      image_url: null,
      placement: null,
      eliminated_in_episode: null,
      tribe_name: contestant.tribe_name,
      tribe_color: contestant.tribe_color,
      age: null,
      occupation: null,
      hometown: null,
      bio: null,
      total_points: 12,
      episodes: [{
        episode_number: 2,
        points: 12,
        events: [{ label: 'Won immunity', points: 12, token_value: 0, quantity: 1 }],
        eliminated_type: null,
      }],
    } as ContestantPerformance

    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons/season-1') return { id: 'season-1', season_id: 'season-1' }
      if (path.endsWith('/contestants')) return [contestant]
      if (path.endsWith('/standings')) return [player]
      if (path.endsWith('/episodes')) return [] as Episode[]
      if (path.includes('/roster/')) return roster
      if (path.includes('/scoring-breakdown/')) {
        return { roster: [{ contestant_id: contestant.id, points: 12 }], picks: [] }
      }
      if (path.includes('/advantage-plays/')) return []
      if (path === `/contestants/${contestant.id}/performance`) return performance
      throw new Error(`Unexpected path: ${path}`)
    })

    renderWithApp(
      <Routes>
        <Route path="/league-seasons/:leagueSeasonId/team/:userId" element={<TeamPage />} />
        <Route path="/contestants/:contestantId" element={<p>Contestant page</p>} />
      </Routes>,
      { route: '/league-seasons/season-1/team/friend-1' },
    )

    const name = await screen.findByText('Kenzie')
    expect(name.closest('a')).toBeNull()

    await userEvent.click(name)

    expect(await screen.findByRole('button', { name: /Ep 2/ })).toBeVisible()
    expect(screen.queryByText('Contestant page')).not.toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/contestants/cast-1/performance')
  })

  it('reads the teams either side in the background, so a swipe lands ready (#814)', async () => {
    const standing = (user_id: string, display_name: string, total_points: number) =>
      ({
        user_id, display_name, roster_points: total_points, elimination_points: 0,
        finale_points: 0, total_points, trend: null, trend_delta: 0, last_episode_points: 0,
        active_survivors: [], recently_eliminated_survivors: [], sole_survivor_contestant_id: null,
      }) as StandingEntry
    // Standings order: Ahead, then the team on screen, then Behind.
    const field = [standing('ahead', 'Ahead', 30), standing('me', 'Me', 20), standing('behind', 'Behind', 10)]

    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons/season-1') return { id: 'season-1', season_id: 'season-1' }
      if (path.endsWith('/contestants')) return []
      if (path.endsWith('/standings')) return field
      if (path.endsWith('/episodes')) return [] as Episode[]
      if (path.includes('/roster/')) return []
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [], sole_survivor_bonus: 0 }
      if (path.includes('/advantage-plays/')) return []
      if (path.includes('/picks/')) return {}
      if (path.endsWith('/eliminations')) return []
      if (path.includes('/finale-predictions/')) return null
      throw new Error(`Unexpected path: ${path}`)
    })

    renderWithApp(
      <Routes>
        <Route path="/league-seasons/:leagueSeasonId/team/:userId" element={<TeamPage />} />
      </Routes>,
      { route: '/league-seasons/season-1/team/me' },
    )

    expect(await screen.findByRole('heading', { name: /Me's Season/ })).toBeVisible()

    // Both neighbours' per-player reads go out without being asked for.
    await vi.waitFor(() => {
      for (const sibling of ['ahead', 'behind']) {
        for (const path of [
          `/league-seasons/season-1/roster/${sibling}`,
          `/league-seasons/season-1/scoring-breakdown/${sibling}`,
          `/league-seasons/season-1/advantage-plays/${sibling}`,
          `/league-seasons/season-1/picks/${sibling}`,
          `/league-seasons/season-1/finale-predictions/${sibling}`,
        ]) {
          expect(api.get).toHaveBeenCalledWith(path)
        }
      }
    })
  })

  it('starts with only Tribe open; Expand all reveals the ballot (#646)', async () => {
    const episode = { id: 'ep-1', season_id: 'season-1', episode_number: 1, is_finale: false, status: 'scored', picks_lock_at: '2020-01-01T00:00:00Z', title: null } as Episode
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons/season-1') return { id: 'season-1', season_id: 'season-1' }
      if (path.endsWith('/contestants')) return [{ id: 'cast-1', name: 'Kenzie' }]
      if (path.endsWith('/standings')) return [{ user_id: 'friend-1', display_name: 'Friend', roster_points: 0, elimination_points: 5, finale_points: 0, total_points: 5, trend: null, trend_delta: 0, last_episode_points: 5, active_survivors: [], recently_eliminated_survivors: [] }]
      if (path.endsWith('/episodes')) return [episode]
      if (path.includes('/roster/')) return []
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [], sole_survivor_contestant_id: null, sole_survivor_bonus: 0 }
      if (path.includes('/advantage-plays/')) return [{ id: 'play-1', episode_id: 'ep-1', advantage_type: 'double_vote_points', target_contestant_id: 'cast-1', points_earned: 5 }]
      // A real network gap: instantly resolving mocks let React batch the whole
      // load into one render, which hides the latch.
      // Every episode's ballot in one keyed response (#803).
      if (path.includes('/picks/')) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return { 'ep-1': [{ id: 'pick-1', episode_id: 'ep-1', contestant_id: 'cast-1' }] }
      }
      if (path.endsWith('/eliminations')) return [{ id: 'elim-1', episode_id: 'ep-1', contestant_id: 'cast-1', elimination_type: 'voted_out' }]
      if (path.includes('/finale-predictions/')) throw new Error('404')
      throw new Error(`Unexpected path: ${path}`)
    })

    renderWithApp(
      <Routes>
        <Route path="/league-seasons/:leagueSeasonId/team/:userId" element={<TeamPage />} />
      </Routes>,
      { route: '/league-seasons/season-1/team/friend-1' },
    )

    expect(await screen.findByRole('button', { name: /^Tribe/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /^Ballot/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Ep 1')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand all' }))

    expect(screen.getByText('Ep 1')).toBeVisible()
    // The played ×2 reads on the ballot row itself: the idol sits on the
    // doubled vote, whose green pill says it hit. No separate Advantages ledger.
    const idol = screen.getByRole('img', { name: 'Power Vote' })
    expect(idol).toBeVisible()
    expect(idol.closest('span[class*="jade"]')).toHaveTextContent('Kenzie')
    expect(screen.queryByRole('button', { name: /^Advantages/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeVisible()
  })
})
