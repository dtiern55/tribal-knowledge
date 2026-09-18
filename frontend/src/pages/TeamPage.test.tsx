import { QueryClient } from '@tanstack/react-query'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router'
import { api, ApiError } from '../lib/api'
import { renderWithApp } from '../test/render'
import type { Contestant, ContestantPerformance, Episode, RosterPick, StandingEntry } from '../types'
import { TeamPage } from './TeamPage'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
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

  it('says the league-season could not be read instead of loading forever (#816)', async () => {
    // Everything below the league-season read is disabled until it answers, and
    // a disabled query is pending, so gating the loader on "nothing pending"
    // would hold the loader over the error for good. A stale link or a URL
    // copied from another league is a 404/403 here.
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path === '/league-seasons/season-1') throw new ApiError('League season not found', 404)
      if (path.endsWith('/standings')) return []
      throw new Error(`Unexpected path: ${path}`)
    })

    renderWithApp(
      <Routes>
        <Route path="/league-seasons/:leagueSeasonId/team/:userId" element={<TeamPage />} />
      </Routes>,
      { route: '/league-seasons/season-1/team/friend-1' },
    )

    expect(await screen.findByText('Could not load this team')).toBeVisible()
    expect(screen.getByText('League season not found')).toBeVisible()
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

  it('stays drawn when a forgiven refusal is retried (#822)', async () => {
    // Another player's team pre-lock: all six reads this page forgives refuse
    // — the per-player five, and the elimination ledger, which is in the
    // loading gate but not the error gate. A refused query holds no data, so a
    // refetch resets it to pending — on every window focus, and after every
    // write anywhere in the app — and the page must not re-enter its loading
    // state for any of them.
    const refused = [
      '/seasons/season-1/eliminations',
      '/league-seasons/season-1/roster/friend-1',
      '/league-seasons/season-1/scoring-breakdown/friend-1',
      '/league-seasons/season-1/advantage-plays/friend-1',
      '/league-seasons/season-1/picks/friend-1',
      '/league-seasons/season-1/finale-predictions/friend-1',
    ]
    const player = {
      user_id: 'friend-1', display_name: 'Friend', roster_points: 0, elimination_points: 0,
      finale_points: 0, total_points: 0, trend: null, trend_delta: 0, last_episode_points: 0,
      active_survivors: [], recently_eliminated_survivors: [], sole_survivor_contestant_id: null,
    } as StandingEntry
    const asked: string[] = []
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      asked.push(path)
      if (path === '/league-seasons/season-1') return { id: 'season-1', season_id: 'season-1' }
      if (path === '/seasons/season-1/contestants') return [] as Contestant[]
      if (path === '/seasons/season-1/episodes') return [] as Episode[]
      if (path === '/league-seasons/season-1/standings') return [player]
      if (refused.includes(path)) {
        // Refuses at once the first time; the retry stays in the air, so the
        // page can be read while the refused query is back to pending.
        if (asked.filter((p) => p === path).length > 1) return new Promise(() => {}) as Promise<never>
        throw new ApiError('Not yet', 403)
      }
      throw new Error(`Unexpected path: ${path}`)
    })

    // The test holds the cache so it can trigger the retry itself.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithApp(
      <Routes>
        <Route path="/league-seasons/:leagueSeasonId/team/:userId" element={<TeamPage />} />
      </Routes>,
      { route: '/league-seasons/season-1/team/friend-1', client },
    )

    const heading = await screen.findByRole('heading', { name: /Friend's Season/ })
    expect(screen.getByText('Team details are still private')).toBeVisible()

    // What a window focus or a write elsewhere does: everything refetches. The
    // `setTimeout(0)` is what gets the refetch's pending state on screen:
    // react-query schedules its notifications with `setTimeout(cb, 0)`
    // (notifyManager), so an act with nothing awaited in it returns before
    // React has been told anything.
    await act(async () => {
      void client.invalidateQueries()
      await new Promise((r) => setTimeout(r, 0))
    })

    // Every forgiven read really is back in the air, or this proves nothing.
    for (const path of refused) expect(asked.filter((p) => p === path)).toHaveLength(2)
    // And the team is still on screen, not back behind the loading state. What
    // the Tribe section says during that retry is #830, not asserted here.
    expect(heading).toBeVisible()
    expect(heading.closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false')
  })
})
