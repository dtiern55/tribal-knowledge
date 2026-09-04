import type { Session } from '@supabase/supabase-js'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import type { Season } from '../types'
import { renderWithApp } from '../test/render'
import { ContestantPage } from './ContestantPage'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  getActiveSeason: vi.fn(),
}))

const season = { id: 'season-1', name: 'Survivor 51', status: 'active' } as Season
const auth = { session: { user: { id: 'user-1' }, access_token: 't' } as Session }

/** Full cast in cast-page order; only Kenzie and Venus are on the roster. */
const CAST = [
  { id: 'cast-1', name: 'Kenzie', image_url: null, placement: null, eliminated_in_episode: null, tribe_name: 'Yanu', tribe_color: null, total_points: 15, total_tokens: 0 },
  { id: 'cast-2', name: 'Charlie', image_url: null, placement: null, eliminated_in_episode: null, tribe_name: 'Siga', tribe_color: null, total_points: 12, total_tokens: 0 },
  { id: 'cast-3', name: 'Venus', image_url: null, placement: null, eliminated_in_episode: null, tribe_name: 'Nami', tribe_color: null, total_points: 9, total_tokens: 0 },
]

function arrange() {
  vi.mocked(getActiveSeason).mockResolvedValue(season)
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path.endsWith('/performance')) {
      return {
        name: 'Kenzie', image_url: null, placement: null, eliminated_in_episode: null,
        tribe_name: 'Yanu', tribe_color: null, age: null, occupation: null,
        hometown: null, bio: null, bio_qa: [{ question: 'Pet Peeves', answer: 'Under seasoned food.' }], total_points: 15, episodes: [],
      }
    }
    if (path.endsWith('/cast')) return CAST
    if (path.includes('/roster/')) {
      return [
        { id: 'r1', contestant_id: 'cast-1', active_from_episode: 2, active_until_episode: null },
        { id: 'r2', contestant_id: 'cast-3', active_from_episode: 2, active_until_episode: null },
      ]
    }
    if (path.includes('/scoring-breakdown/')) {
      // 30 against a raw 15: a Double Castaway Points play landed on Kenzie.
      return { roster: [{ contestant_id: 'cast-1', points: 30 }], picks: [] }
    }
    return []
  })
}

function renderAt(route: string) {
  return renderWithApp(
    <Routes>
      <Route path="/contestants/:contestantId" element={<ContestantPage />} />
    </Routes>,
    { auth, route },
  )
}

describe('ContestantPage roster context', () => {
  beforeEach(() => vi.clearAllMocks())

  it('swipes across the whole cast when opened from the cast page', async () => {
    arrange()
    renderAt('/contestants/cast-1')

    expect(await screen.findByRole('heading', { name: 'Kenzie' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Back to cast/ })).toBeVisible()
    // Charlie is next in the cast even though he is not on the roster
    expect(await screen.findByRole('button', { name: 'Next: Charlie' })).toBeVisible()
    expect(screen.queryByText(/for you/)).not.toBeInTheDocument()
  })

  it('swipes only across your roster and shows the doubled total from My Season', async () => {
    arrange()
    renderAt('/contestants/cast-1?from=roster')

    expect(await screen.findByRole('heading', { name: 'Kenzie' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Back to My Season/ })).toBeVisible()
    // Skips Charlie: the next sibling is the other castaway on the roster.
    expect(await screen.findByRole('button', { name: 'Next: Venus' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /Charlie/ })).not.toBeInTheDocument()
    expect(await screen.findByText(/\+30 for you/)).toBeVisible()
    // The CBS questionnaire renders as one native disclosure section, collapsed by default.
    expect(screen.getByText('CBS cast questionnaire')).toBeVisible()
    expect(screen.getByText('Pet Peeves').closest('details')).not.toBeNull()
  })
})
