import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import type { CastMember, Episode, RulesResponse, Season } from '../types'
import { renderWithApp } from '../test/render'
import { WatchPage } from './WatchPage'

vi.mock('../lib/api', () => ({ api: { get: vi.fn(), put: vi.fn() }, getActiveSeason: vi.fn() }))

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
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.put).mockResolvedValue(undefined as never)
    vi.mocked(api.get).mockImplementation((path: string) => {
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

  it('gates non-commissioners out', async () => {
    renderWithApp(<WatchPage />, { auth: { profile: { id: 'u2', display_name: 'Player', is_admin: false, leagues: [] } } })
    expect(await screen.findByText('Commissioner access required')).toBeInTheDocument()
  })
})
