import type { Session } from '@supabase/supabase-js'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import { isBroadcastWindow, resolveMySeasonState } from '../lib/mySeasonState'
import type { Episode, EpisodeResult, Season } from '../types'
import { renderWithApp } from '../test/render'
import { MySeasonPage } from './MySeasonPage'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getActiveSeason: vi.fn(),
}))

const season = {
  id: 'season-1',
  name: 'Survivor 51',
  status: 'active',
  roster_lock_episode: 2,
} as Season

function episode(number: number, status: string, lock: string): Episode {
  return {
    id: `episode-${number}`,
    season_id: season.id,
    episode_number: number,
    air_date: lock.slice(0, 10),
    max_elimination_picks: 3,
    is_finale: false,
    picks_lock_at: lock,
    status,
    created_at: lock,
  }
}

function result(overrides: Partial<EpisodeResult> = {}): EpisodeResult {
  return {
    episode_id: 'episode-2',
    episode_number: 2,
    is_finale: false,
    eliminated: [
      { contestant_id: 'cast-1', name: 'Kenzie', image_url: null, elimination_type: 'voted_out' },
      { contestant_id: 'cast-2', name: 'Charlie', image_url: null, elimination_type: 'voted_out' },
    ],
    ballot: [
      { contestant_id: 'cast-1', name: 'Kenzie', image_url: null, prediction_type: 'elimination', correct: true, points: 15 },
      { contestant_id: 'cast-2', name: 'Charlie', image_url: null, prediction_type: 'elimination', correct: true, points: 15 },
      { contestant_id: 'cast-3', name: 'Venus', image_url: null, prediction_type: 'elimination', correct: false, points: 0 },
    ],
    roster: [
      { contestant_id: 'cast-4', name: 'Tiffany', image_url: null, points: 15 },
    ],
    roster_points: 15,
    roster_adjustment_points: 0,
    ballot_points: 30,
    weekly_plays: [
      {
        advantage_play_id: 'play-1',
        advantage_type: 'double_vote_points',
        target_contestant_id: null,
        target_name: null,
        bonus_points: 30,
      },
    ],
    weekly_play_bonus: 30,
    total_points: 75,
    current_rank: 2,
    prior_rank: 5,
    rank_delta: 3,
    ...overrides,
  }
}

function arrange(
  episodes: Episode[],
  automaticResult?: EpisodeResult,
  replayResult?: EpisodeResult,
) {
  vi.mocked(getActiveSeason).mockResolvedValue(season)
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.endsWith('/episodes')) return episodes
    if (path.endsWith('/reveal')) return automaticResult
    if (path.includes('/episode-results/')) return replayResult
    if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
    return []
  })
}

const auth = {
  session: { user: { id: 'user-1' }, access_token: 'test-token' } as Session,
}

describe('MySeasonPage state shell', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders a locked composition without mounting editable Open controls', async () => {
    arrange([
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      episode(2, 'upcoming', '2026-08-02T00:00:00Z'),
    ])
    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('Episode 2 · locked')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Results are pending' })).toBeVisible()
    expect(screen.getByText('No ballot was submitted.')).toBeVisible()
    expect(screen.getByText('No weekly play used')).toBeVisible()
    expect(screen.getByText('Awaiting league scoring')).toBeVisible()
    expect(screen.getByText(/episode is over, but league scoring/i)).toBeVisible()
    const lockedState = screen.getByRole('region', { name: 'Results are pending' })
    expect(lockedState).toHaveAttribute('data-variant', 'delayed')
    expect(lockedState.querySelector('[class*="lg:grid-cols"]')).not.toBeInTheDocument()
    expect(document.documentElement).not.toHaveClass('locked-night')
    expect(screen.queryByRole('heading', { name: 'My Roster' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Weekly Votes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit|Save ballot|Use on ballot|Confirm Swap/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Episode History/ })).not.toBeInTheDocument()
  })

  it('gives watch-only composition precedence over a later open episode', async () => {
    arrange([
      episode(1, 'upcoming', '2026-08-20T00:00:00Z'),
      episode(2, 'upcoming', '2099-08-27T00:00:00Z'),
    ])
    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('Episode 1 · watch only')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'My Roster' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Weekly Votes' })).not.toBeInTheDocument()
  })

  it('renders the Open state ballot first with one shared weekly-play control', async () => {
    arrange([
      episode(1, 'scored', '2026-08-20T00:00:00Z'),
      episode(2, 'upcoming', '2099-08-27T00:00:00Z'),
    ])
    renderWithApp(<MySeasonPage />, { auth })

    const ballot = await screen.findByRole('heading', { name: 'Your ballot' })
    const weeklyPlay = screen.getByRole('heading', { name: /Weekly play/ })
    const roster = screen.getByRole('heading', { name: /^Active Roster/ })
    expect(ballot.closest('[data-layout="open-desktop"]')).not.toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: 'Episode decisions' })).not.toBeInTheDocument()
    expect(ballot.compareDocumentPosition(weeklyPlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(weeklyPlay.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: /Weekly play/ })).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Past Episodes' })).not.toBeInTheDocument()
    expect(screen.queryByText('This Week')).not.toBeInTheDocument()
  })

  it('supports a variable ballot limit, tribe grouping, selection, save, and edit', async () => {
    const user = userEvent.setup()
    const open = { ...episode(2, 'upcoming', '2099-08-27T00:00:00Z'), max_elimination_picks: 2 }
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/episodes')) return [episode(1, 'scored', '2026-08-01T00:00:00Z'), open]
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: '/kenzie.jpg', tribe_color: '#7651a1', tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: '/charlie.jpg', tribe_color: '#4ca56a', tribe_name: 'Siga', eliminated_in_episode: null },
          { id: 'cast-3', name: 'Venus', image_url: null, tribe_color: '#f28b39', tribe_name: 'Nami', eliminated_in_episode: null },
          ...Array.from({ length: 15 }, (_, index) => ({
            id: `cast-extra-${index}`,
            name: `Castaway ${index + 4}`,
            image_url: null,
            tribe_color: ['#7651a1', '#4ca56a', '#f28b39'][index % 3],
            tribe_name: ['Yanu', 'Siga', 'Nami'][index % 3],
            eliminated_in_episode: null,
          })),
          { id: 'cast-out', name: 'Earlier Boot', image_url: null, tribe_color: '#7651a1', tribe_name: 'Yanu', eliminated_in_episode: 1 },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })
    vi.mocked(api.post).mockResolvedValue([
      { id: 'pick-1', contestant_id: 'cast-1' },
      { id: 'pick-2', contestant_id: 'cast-2' },
    ])

    renderWithApp(<MySeasonPage />, { auth })

    const ballot = await screen.findByRole('region', { name: 'Your ballot' })
    expect(within(ballot).getByRole('heading', { name: 'Yanu' })).toBeVisible()
    expect(within(ballot).getByRole('heading', { name: 'Siga' })).toBeVisible()
    expect(within(ballot).getByRole('heading', { name: 'Nami' })).toBeVisible()
    expect(within(ballot).queryByText('Earlier Boot')).not.toBeInTheDocument()
    expect(within(ballot).getByText('0 of 2 selected')).toBeVisible()
    expect(within(ballot).getByRole('button', { name: /Save ballot/ })).toBeDisabled()

    expect(within(ballot).getAllByRole('button', { name: /for ballot/ })).toHaveLength(18)
    const kenzie = within(ballot).getByRole('button', { name: 'Select Kenzie for ballot' })
    const charlie = within(ballot).getByRole('button', { name: 'Select Charlie for ballot' })
    await user.click(kenzie)
    await user.click(charlie)
    expect(within(kenzie).getByText('1')).toBeVisible()
    expect(within(charlie).getByText('2')).toBeVisible()
    expect(within(ballot).getByText('2 of 2 selected')).toBeVisible()
    expect(within(ballot).getByRole('button', { name: 'Select Venus for ballot' })).toBeDisabled()

    await user.click(within(ballot).getByRole('button', { name: /Save ballot/ }))
    expect(await screen.findByText('Ballot saved for Episode 2')).toBeVisible()
    expect(api.post).toHaveBeenCalledWith('/episodes/episode-2/picks', {
      contestant_ids: ['cast-1', 'cast-2'],
    })

    await user.click(within(ballot).getByRole('button', { name: 'Edit ballot' }))
    expect(within(ballot).getByText('2 of 2 selected')).toBeVisible()
    expect(within(ballot).getByRole('button', { name: /Save ballot/ })).toBeDisabled()
  })

  it('keeps the weekly play distinct and explains both doubles and free swaps', async () => {
    vi.mocked(getActiveSeason).mockResolvedValue({ ...season, free_swaps: 1, swap_lock_episode: 10 })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [
          episode(1, 'scored', '2026-08-01T00:00:00Z'),
          episode(2, 'scored', '2026-08-08T00:00:00Z'),
          episode(3, 'upcoming', '2099-08-27T00:00:00Z'),
        ]
      }
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/roster/')) {
        return [{ id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null, swap_penalty_points: 0 }]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByRole('heading', { name: /Weekly play/ })).toBeVisible()
    expect(screen.getByText('Double Roster Points')).toBeVisible()
    expect(screen.getByText('Double Vote Points')).toBeVisible()
    expect(screen.getByText(/every correct pick on this episode's ballot/i)).toBeVisible()
    expect(screen.getByText(/A free roster swap does not use this play/)).toBeVisible()
    expect(await screen.findByText('Free swap left: 1 · swaps lock at episode 10')).toBeVisible()
    expect(screen.getAllByRole('heading', { name: /Weekly play/ })).toHaveLength(1)
  })

  it('marks a roster swap as the weekly play after free swaps are used', async () => {
    vi.mocked(getActiveSeason).mockResolvedValue({ ...season, free_swaps: 1, swap_lock_episode: 10 })
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/episodes')) {
        return [
          episode(1, 'scored', '2026-08-01T00:00:00Z'),
          episode(2, 'scored', '2026-08-08T00:00:00Z'),
          episode(3, 'upcoming', '2099-08-27T00:00:00Z'),
        ]
      }
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: null, tribe_name: 'Yanu', eliminated_in_episode: null },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_name: 'Siga', eliminated_in_episode: null },
          { id: 'cast-3', name: 'Venus', image_url: null, tribe_name: 'Nami', eliminated_in_episode: null },
        ]
      }
      if (path.includes('/roster/')) {
        return [
          { id: 'roster-1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: 2, swap_penalty_points: 0 },
          { id: 'roster-2', contestant_id: 'cast-2', active_from_episode: 3, active_until_episode: null, swap_penalty_points: 0 },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('This will use your advantage play for the episode. · swaps lock at episode 10')).toBeVisible()
  })

  it('limits broadcast styling to the short window after lock without changing state', () => {
    const locked = episode(2, 'upcoming', '2026-08-13T18:00:00Z')
    expect(isBroadcastWindow(locked, new Date('2026-08-13T20:00:00Z'))).toBe(true)
    expect(isBroadcastWindow(locked, new Date('2026-08-14T08:00:00Z'))).toBe(false)
    expect(resolveMySeasonState(season, [locked])).toEqual({ kind: 'locked', episode: locked })
  })

  it('uses the torchlit broadcast treatment only during the short airing window', async () => {
    const recentlyLocked = episode(2, 'upcoming', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    arrange([episode(1, 'scored', '2026-08-01T00:00:00Z'), recentlyLocked])

    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByRole('heading', { name: 'The votes are in' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'The votes are in' })).toHaveAttribute('data-variant', 'broadcast')
    expect(screen.getByText('Scoring follows the episode')).toBeVisible()
    expect(screen.queryByText(/ballot, roster, and weekly play are final/i)).not.toBeInTheDocument()
    expect(document.documentElement).toHaveClass('locked-night')
  })

  it('shows the server-saved ballot roster and weekly play while locked', async () => {
    const episodes = [
      episode(1, 'scored', '2026-08-01T00:00:00Z'),
      episode(2, 'upcoming', '2026-08-02T00:00:00Z'),
    ]
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation(async (path: string) => {
      if (path.endsWith('/episodes')) return episodes
      if (path.endsWith('/contestants')) {
        return [
          { id: 'cast-1', name: 'Kenzie', image_url: '/kenzie.jpg', tribe_color: '#123456', tribe_name: 'Yanu' },
          { id: 'cast-2', name: 'Charlie', image_url: null, tribe_color: '#abcdef', tribe_name: 'Siga' },
        ]
      }
      if (path.includes('/scoring-breakdown/')) return { roster: [], picks: [] }
      if (path.endsWith('/reveal')) return undefined
      if (path.includes('/advantage-plays/')) {
        return [{ id: 'play-1', episode_id: 'episode-2', advantage_type: 'double_vote_points', target_contestant_id: null }]
      }
      if (path.includes('/picks/')) return [{ id: 'pick-1', contestant_id: 'cast-1' }]
      if (path.includes('/roster/')) return [{ id: 'roster-1', contestant_id: 'cast-2', active_until_episode: null }]
      return []
    })

    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('Kenzie')).toBeVisible()
    expect(screen.getByText('Charlie')).toBeVisible()
    expect(screen.getByRole('img', { name: 'Kenzie' })).toHaveAttribute('src', '/kenzie.jpg')
    expect(screen.getByText('Double Vote Points')).toBeVisible()
  })

  it('shows the latest automatic reveal and retries acknowledgement before continuing to Open', async () => {
    const user = userEvent.setup()
    arrange(
      [
        episode(1, 'scored', '2026-08-01T00:00:00Z'),
        episode(2, 'scored', '2026-08-08T00:00:00Z'),
        episode(3, 'upcoming', '2099-08-27T00:00:00Z'),
      ],
      result({
        insights: [
          { id: 'popular-pick', label: 'League call', value: '72%', detail: 'picked Kenzie' },
        ],
      }),
    )
    vi.mocked(api.post)
      .mockRejectedValueOnce(new Error('Still saving'))
      .mockResolvedValueOnce({})
    renderWithApp(<MySeasonPage />, { auth })

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('2 castaways were eliminated')
    expect(dialog).toHaveTextContent('You called 2 of 3 ballot picks correctly.')
    expect(screen.getByRole('heading', { name: 'Roster earnings' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Ballot earnings' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Weekly play' })).toBeVisible()
    expect(dialog).toHaveTextContent('Up 3 spots to #2')
    expect(screen.getByRole('heading', { name: 'Episode insight' })).toBeVisible()
    expect(dialog).toHaveTextContent('72%')
    expect(dialog.querySelector('article')).toHaveClass('max-w-5xl')
    expect(dialog).toHaveTextContent('Roster + ballot + weekly play+75 pts')

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Still saving')
    expect(screen.getByRole('dialog')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Your ballot' })).toBeVisible()
    expect(api.post).toHaveBeenCalledWith(
      '/seasons/season-1/reveal-acknowledgement',
      { episode_id: 'episode-2' },
    )
  })

  it('replays a scored Episode History result without acknowledging it', async () => {
    const user = userEvent.setup()
    arrange(
      [
        episode(1, 'scored', '2026-08-01T00:00:00Z'),
        episode(2, 'scored', '2026-08-08T00:00:00Z'),
      ],
      undefined,
      result({ current_rank: null, prior_rank: null, rank_delta: null }),
    )
    renderWithApp(<MySeasonPage />, { auth })

    await screen.findByRole('heading', { name: 'Between episodes' })
    await user.click(screen.getByRole('button', { name: /Episode History/ }))
    await user.click(screen.getByRole('button', { name: /Episode 2.*View your scored result.*Replay/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Episode 2 replay')
    expect(dialog).not.toHaveTextContent(/ranked|spots to|Held at/)
    expect(dialog.querySelector('article')).toHaveClass('max-w-5xl')
    expect(screen.getByRole('heading', { name: 'Roster earnings' }).closest('section')?.parentElement).toHaveClass('lg:grid-cols-3')
    await user.click(screen.getByRole('button', { name: 'Back to My Season' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Between episodes' })).toBeVisible()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('continues an automatic reveal to Intermission when no next episode exists', async () => {
    const user = userEvent.setup()
    arrange(
      [
        episode(1, 'scored', '2026-08-01T00:00:00Z'),
        episode(2, 'scored', '2026-08-08T00:00:00Z'),
      ],
      result({
        eliminated: [],
        ballot: [],
        ballot_points: 0,
        weekly_plays: [],
        weekly_play_bonus: 0,
        total_points: 15,
        current_rank: 1,
        prior_rank: null,
        rank_delta: null,
      }),
    )
    vi.mocked(api.post).mockResolvedValue({})
    renderWithApp(<MySeasonPage />, { auth })

    expect(await screen.findByText('No one was eliminated')).toBeVisible()
    expect(screen.getByText('You did not submit a ballot for this episode.')).toBeVisible()
    expect(screen.getByText('No weekly play was used. Your base score is unchanged.')).toBeVisible()
    expect(screen.getByText('Now ranked #1')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Episode insight' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Between episodes' })).toBeVisible()
  })

  it('continues the finale reveal to Complete when the season is completed', async () => {
    const user = userEvent.setup()
    arrange(
      [
        episode(1, 'scored', '2026-08-01T00:00:00Z'),
        { ...episode(2, 'scored', '2026-08-08T00:00:00Z'), is_finale: true },
      ],
      result({ is_finale: true }),
    )
    vi.mocked(getActiveSeason).mockResolvedValue({ ...season, status: 'completed' })
    vi.mocked(api.post).mockResolvedValue({})
    renderWithApp(<MySeasonPage />, { auth })

    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Season complete' })).toBeVisible()
  })
})
