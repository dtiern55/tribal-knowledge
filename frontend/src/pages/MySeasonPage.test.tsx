import type { Session } from '@supabase/supabase-js'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import type { Episode, Season } from '../types'
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

function arrange(episodes: Episode[]) {
  vi.mocked(getActiveSeason).mockResolvedValue(season)
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.endsWith('/episodes')) return episodes
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

    expect(await screen.findByText('Episode 2 locked')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'My Roster' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Weekly Votes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit Votes|Confirm Swap/ })).not.toBeInTheDocument()
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

    const ballot = await screen.findByRole('heading', { name: /^Weekly Votes/ })
    const weeklyPlay = screen.getByRole('heading', { name: /Weekly play/ })
    const roster = screen.getByRole('heading', { name: /^Active Roster/ })

    expect(ballot.compareDocumentPosition(weeklyPlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(weeklyPlay.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('heading', { name: /Weekly play/ })).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: 'Past Episodes' })).not.toBeInTheDocument()
  })
})
