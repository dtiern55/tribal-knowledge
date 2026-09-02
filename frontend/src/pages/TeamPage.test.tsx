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
})
