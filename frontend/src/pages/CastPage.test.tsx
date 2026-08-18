import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import { renderWithApp } from '../test/render'
import type { CastMember, Season } from '../types'
import { CastPage } from './CastPage'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
  getActiveSeason: vi.fn(),
}))

describe('CastPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one flat points-ranked list with tribe treatments', async () => {
    const season = { id: 'season-1', name: 'Survivor 51', status: 'active' } as Season
    const cast: CastMember[] = [
      {
        id: 'out',
        name: 'First Boot',
        image_url: null,
        placement: null,
        eliminated_in_episode: 1,
        tribe_name: 'Yanu',
        tribe_color: '#7651a1',
        total_points: 20,
        total_tokens: 0,
      },
      {
        id: 'active',
        name: 'Kenzie',
        image_url: null,
        placement: null,
        eliminated_in_episode: null,
        tribe_name: 'Siga',
        tribe_color: '#4ca56a',
        total_points: 12,
        total_tokens: 0,
      },
    ]
    vi.mocked(getActiveSeason).mockResolvedValue(season)
    vi.mocked(api.get).mockResolvedValue(cast)

    renderWithApp(<CastPage />)

    const rows = await screen.findAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Kenzie'),
      expect.stringContaining('First Boot'),
    ])
    expect(screen.getByText('Kenzie')).toHaveClass('font-display')
    expect(screen.getByText('+12 pts')).toHaveClass('text-jade-600')
    expect(screen.getByTitle('Siga')).toHaveStyle({ '--tribe-color': '#4ca56a' })
    expect(screen.queryByTitle('Still in the game')).not.toBeInTheDocument()
  })
})
