import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { CastMember, Episode, RulesResponse, Season } from '../types'
import { renderWithApp } from '../test/render'
import { WatchPage } from './WatchPage'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()), api: { get: vi.fn(), put: vi.fn() } }))

const season = { id: 'ls-1', season_id: 'season-1', name: 'Survivor 51', roster_lock_episode: 1, merge_episode: null } as Season
const episode = { id: 'ep-1', episode_number: 5, picks_lock_at: '2020-01-01T00:00:00Z', status: 'locked' } as Episode
const cast = [
  { id: 'c1', name: 'Sage', eliminated_in_episode: null, total_points: 0 },
  { id: 'c2', name: 'Rizo', eliminated_in_episode: null, total_points: 0 },
] as CastMember[]
const rules = {
  scoring_events: [
    { event_type: 'read_treemail_or_instructions', label: 'Treemail', point_value: 3, postmerge_point_value: null, token_value: 0, is_per_unit: true },
    { event_type: 'go_on_journey', label: 'Journey', point_value: 4, postmerge_point_value: null, token_value: 0, is_per_unit: false },
  ],
  has_redemption: false,
} as unknown as RulesResponse

const admin = { auth: { profile: { id: 'u1', display_name: 'Danny', is_admin: true, leagues: [] } } }

describe('WatchPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(api.put).mockResolvedValue(undefined as never)
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === '/league-seasons') return Promise.resolve([season]) as never
      if (path.endsWith('/watch')) return Promise.resolve({ data: {} }) as never
      if (path.endsWith('/episodes')) return Promise.resolve([episode]) as never
      if (path.endsWith('/rules')) return Promise.resolve(rules) as never
      return Promise.resolve(cast) as never
    })
  })

  it('counts a per-unit chip and persists the new state shape', async () => {
    const user = userEvent.setup()
    renderWithApp(<WatchPage />, admin)

    await user.click(await screen.findByRole('button', { name: /Extras/ }))
    await user.click(screen.getByRole('button', { name: /Treemail/ }))
    await user.click(screen.getByRole('button', { name: /Sage/ }))
    await user.click(screen.getByRole('button', { name: /Sage/ }))
    expect(screen.getByText('x2')).toBeInTheDocument()

    expect(JSON.parse(localStorage.getItem('tk-watch-ep-1') ?? '{}')).toMatchObject({
      events: { read_treemail_or_instructions: { c1: 2 } },
    })
  })

  it('records a boot and persists it', async () => {
    const user = userEvent.setup()
    renderWithApp(<WatchPage />, admin)

    await user.click(await screen.findByRole('button', { name: /Tribal/ }))
    // "Voted out" is a collapsed section below the votes; scope to it so we
    // pick the boot button, not the same-named voter row.
    const votedOut = screen.getByText('Voted out').closest('details') as HTMLElement
    await user.click(within(votedOut).getByRole('button', { name: /Rizo/ }))
    expect(JSON.parse(localStorage.getItem('tk-watch-ep-1') ?? '{}')).toMatchObject({ boots: ['c2'] })
  })

  it("keeps writing to the episode it loaded after tonight's lock passes (#816)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      // Opened before tonight's lock: nothing is airing yet, so the tracker
      // falls back to the last row in the schedule, the finale.
      const tonight = { ...episode, picks_lock_at: new Date(Date.now() + 60 * 60_000).toISOString(), status: 'upcoming' } as Episode
      const finale = { id: 'ep-14', episode_number: 14, picks_lock_at: '2020-01-01T00:00:00Z', status: 'scored', is_finale: true } as Episode
      vi.mocked(api.get).mockImplementation((path: string) => {
        if (path === '/league-seasons') return Promise.resolve([season]) as never
        if (path.endsWith('/watch')) return Promise.resolve({ data: {} }) as never
        if (path.endsWith('/episodes')) return Promise.resolve([tonight, finale]) as never
        if (path.endsWith('/rules')) return Promise.resolve(rules) as never
        return Promise.resolve(cast) as never
      })

      renderWithApp(<WatchPage />, admin)
      expect(await screen.findByText('Episode 14')).toBeVisible()

      // The lock passes mid-sitting. `airingEpisode` answers against the clock,
      // so a target derived per render moves on the next tap — and the sitting's
      // boots land on an episode nobody was recording.
      vi.setSystemTime(Date.now() + 2 * 60 * 60_000)

      await user.click(await screen.findByRole('button', { name: /Tribal/ }))
      const votedOut = screen.getByText('Voted out').closest('details') as HTMLElement
      await user.click(within(votedOut).getByRole('button', { name: /Rizo/ }))

      expect(screen.getByText('Episode 14')).toBeVisible()
      expect(JSON.parse(localStorage.getItem('tk-watch-ep-14') ?? '{}')).toMatchObject({ boots: ['c2'] })
      expect(localStorage.getItem('tk-watch-ep-1')).toBeNull()

      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(api.put).toHaveBeenCalled()
      for (const [path] of vi.mocked(api.put).mock.calls) {
        expect(path).toBe('/league-seasons/ls-1/episodes/ep-14/watch')
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('gates non-commissioners out', async () => {
    renderWithApp(<WatchPage />, { auth: { profile: { id: 'u2', display_name: 'Player', is_admin: false, leagues: [] } } })
    expect(await screen.findByText('Commissioner access required')).toBeInTheDocument()
  })
})
