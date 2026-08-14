import { screen, waitFor } from '@testing-library/react'
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
      if (path === '/seasons') return [season]
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
})
