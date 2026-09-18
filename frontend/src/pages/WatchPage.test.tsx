import { QueryClient } from '@tanstack/react-query'
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../lib/api'
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

  it('stays on screen when the refused tracker read is retried (#822)', async () => {
    // Nothing saved for this episode yet, so the tracker read 404s and the page
    // forgives it — this device's copy is the fallback. A refused query holds no
    // data, so a refetch resets it to pending, on every window focus and after
    // every write anywhere in the app. Mid-episode that is constant, and the
    // page must not flash its loader over the night's tracking each time.
    const watchPath = '/league-seasons/ls-1/episodes/ep-1/watch'
    const asked: string[] = []
    vi.mocked(api.get).mockImplementation((path: string) => {
      asked.push(path)
      if (path === '/league-seasons') return Promise.resolve([season]) as never
      if (path === '/seasons/season-1/cast') return Promise.resolve(cast) as never
      if (path === '/seasons/season-1/episodes') return Promise.resolve([episode]) as never
      if (path === '/league-seasons/ls-1/rules') return Promise.resolve(rules) as never
      if (path === watchPath) {
        // Refuses at once the first time; the retry stays in the air, so the
        // page can be read while the refused query is back to pending.
        if (asked.filter((p) => p === path).length > 1) return new Promise(() => {}) as never
        return Promise.reject(new ApiError('No tracker saved', 404)) as never
      }
      return Promise.reject(new Error(`Unexpected path: ${path}`)) as never
    })

    // The test holds the cache so it can trigger the retry itself.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderWithApp(<WatchPage />, { ...admin, client })

    expect(await screen.findByRole('heading', { name: 'Watch tracker' })).toBeVisible()

    // What a window focus or a write elsewhere does: everything refetches. The
    // turn of the event loop is what gets the refetch's pending state on
    // screen — react-query notifies through a microtask, so an act with
    // nothing awaited in it returns before React has seen it.
    await act(async () => {
      void client.invalidateQueries()
      await new Promise((r) => setTimeout(r, 0))
    })

    // The retry really went out and is still out, or this proves nothing.
    expect(asked.filter((p) => p === watchPath)).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Watch tracker' })).toBeVisible()
    expect(screen.getByRole('button', { name: /Extras/ })).toBeVisible()
  })
})
