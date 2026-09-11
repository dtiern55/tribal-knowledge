import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import type { CastMember, Episode, Season } from '../types'
import { renderWithApp } from '../test/render'
import { WatchPage } from './WatchPage'

vi.mock('../lib/api', () => ({ api: { get: vi.fn() }, getActiveSeason: vi.fn() }))

const season = { id: 'ls-1', season_id: 'season-1', name: 'Survivor 51', roster_lock_episode: 1 } as Season
const episode = {
  id: 'ep-1',
  episode_number: 5,
  picks_lock_at: '2020-01-01T00:00:00Z',
  status: 'locked',
} as Episode
const cast = [
  { id: 'c1', name: 'Sage', eliminated_in_episode: null, total_points: 0 },
  { id: 'c2', name: 'Rizo', eliminated_in_episode: null, total_points: 0 },
] as CastMember[]

const admin = { auth: { profile: { id: 'u1', display_name: 'Danny', is_admin: true, leagues: [] } } }

describe('WatchPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('/episodes') ? [episode] : cast) as never,
    )
  })

  it('counts repeats for a per-unit event and toggles a one-off off again', async () => {
    const user = userEvent.setup()
    renderWithApp(<WatchPage />, admin)

    await user.click(await screen.findByRole('button', { name: /Treemail/ }))
    await user.click(screen.getByRole('button', { name: /Sage/ }))
    await user.click(screen.getByRole('button', { name: /Sage/ }))
    expect(screen.getByText(/Treemail: Sage x2/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Title quote/ }))
    await user.click(screen.getByRole('button', { name: /Rizo/ }))
    expect(screen.getByText(/Title quote: Rizo/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Rizo/ }))
    expect(screen.queryByText(/Title quote: Rizo/)).not.toBeInTheDocument()
  })

  it('takes back the last tap with Undo', async () => {
    const user = userEvent.setup()
    renderWithApp(<WatchPage />, admin)

    await user.click(await screen.findByRole('button', { name: /Treemail/ }))
    await user.click(screen.getByRole('button', { name: /Sage/ }))
    await user.click(screen.getByRole('button', { name: /Sage/ }))
    expect(screen.getByText(/Treemail: Sage x2/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByText(/Treemail: Sage x2/)).not.toBeInTheDocument()
    expect(screen.getByText(/Treemail: Sage/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByText(/Treemail: Sage/)).not.toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'Back to My Season' })).toBeVisible()
  })

  it('keeps the episode scratchpad in this browser', async () => {
    const user = userEvent.setup()
    renderWithApp(<WatchPage />, admin)
    await user.click(await screen.findByRole('button', { name: /Sage/ }))
    expect(JSON.parse(localStorage.getItem('tk-watch-ep-1') ?? '{}')).toMatchObject({
      counts: { 'c1|episode_title_quote': 1 },
    })
  })
})
