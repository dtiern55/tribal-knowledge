import type { Session } from '@supabase/supabase-js'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { Season } from '../types'
import { renderWithApp } from '../test/render'
import { ContestantPage } from './ContestantPage'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
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
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    // The page picks the active season out of this list, as every page does.
    if (path === '/league-seasons') return [season]
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
    // The cast questionnaire is its own collapsible section, tucked away once
    // picking has closed (no pre-episode-2 window in this fixture).
    expect(screen.getByRole('button', { name: /Cast Bio/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Under seasoned food.')).not.toBeInTheDocument()
  })
})

const BIO_QA = [
  { question: '3 Words to Describe You', answer: 'Goofy, ambitious, chaotic' },
  { question: 'Why do you want to be part of Survivor?', answer: 'I love the game.' },
  { question: 'Pet Peeves', answer: 'Under seasoned food.' },
  { question: 'Why will you be the Sole Survivor?', answer: 'High risk, high reward.' },
]

function arrangeBio() {
  vi.mocked(api.get).mockImplementation(async (path: string) => {
    if (path === '/league-seasons') return [{ ...season, roster_lock_episode: 2 } as Season]
    if (path.endsWith('/performance')) {
      return {
        name: 'Ana Sani', image_url: null, placement: null, eliminated_in_episode: null,
        tribe_name: 'Kele', tribe_color: null, age: 34, occupation: 'Voice Actress',
        hometown: 'Toronto', bio: null, bio_qa: BIO_QA, total_points: 0, episodes: [],
      }
    }
    if (path.endsWith('/cast')) return CAST
    // Episode 1 unscored, roster locks at 2 → still in the pre-episode-2 window.
    if (path.endsWith('/episodes')) return [{ episode_number: 1, status: 'aired' }]
    return []
  })
}

describe('ContestantPage cast bio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lifts the three words and the Sole Survivor pitch out, open while picking', async () => {
    arrangeBio()
    renderAt('/contestants/cast-1')

    expect(await screen.findByRole('heading', { name: 'Ana Sani' })).toBeVisible()
    // The three words become the header tagline.
    expect(screen.getByText('“Goofy, ambitious, chaotic”')).toBeVisible()
    // Pre-episode-2, the section is open so the pitch and grid show.
    expect(await screen.findByRole('button', { name: /Cast Bio/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Why Ana will be Sole Survivor')).toBeVisible()
    expect(screen.getByText('“High risk, high reward.”')).toBeVisible()
    // A remaining question renders with its short label.
    expect(screen.getByText('Why Survivor')).toBeVisible()
    expect(screen.getByText('I love the game.')).toBeVisible()
    // The two lifted questions don't also appear in the grid.
    expect(screen.queryByText('3 Words to Describe You')).not.toBeInTheDocument()
  })
})
