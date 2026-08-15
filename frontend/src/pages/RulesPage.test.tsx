import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, getActiveSeason } from '../lib/api'
import type { RulesResponse, Season } from '../types'
import { renderWithApp } from '../test/render'
import { RulesPage } from './RulesPage'

vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
  getActiveSeason: vi.fn(),
}))

const season = {
  id: 'season-1',
  name: 'Survivor 51',
  roster_size: 5,
  roster_lock_episode: 2,
  merge_episode: 7,
  ss_lock_episode: null,
  advantage_lock_episode: 12,
  swap_lock_episode: 10,
  swap_token_cost: 20,
  max_swaps: 3,
  free_swaps: 1,
  token_economy_enabled: false,
  elimination_pick_schedule: [
    { from_episode: 2, picks: 3 },
    { from_episode: 6, picks: 2 },
  ],
} as Season

function response(tokenMode: boolean): RulesResponse {
  return {
    season: { ...season, token_economy_enabled: tokenMode },
    scoring_events: [
      {
        event_type: 'win_individual_immunity',
        label: 'Win individual immunity',
        point_value: 15,
        postmerge_point_value: null,
        token_value: 0,
        is_per_unit: false,
      },
      {
        event_type: 'cry',
        label: 'Cry',
        point_value: 0,
        postmerge_point_value: null,
        token_value: 5,
        is_per_unit: false,
      },
    ],
    prediction_scores: [],
    advantages: [
      { advantage_type: 'double_vote_points', label: 'Double Vote Points', token_cost: 15, enabled: true },
      { advantage_type: 'extra_vote', label: 'Extra Vote', token_cost: 5, enabled: false },
    ],
  }
}

describe('RulesPage rule modes', () => {
  beforeEach(() => {
    vi.mocked(getActiveSeason).mockResolvedValue(season)
  })

  it('describes weekly plays without exposing retired token rules for current seasons', async () => {
    vi.mocked(api.get).mockResolvedValue(response(false))
    renderWithApp(<RulesPage />)

    expect(await screen.findByRole('heading', { name: 'Weekly play' })).toBeVisible()
    expect(screen.getByText(/Double all points earned from your ballot/)).toBeVisible()
    expect(screen.getByText(/does not add a vote/)).toBeVisible()
    expect(screen.getByText(/adds 50% of that castaway's finale roster points/)).toBeVisible()
    expect(screen.queryByRole('heading', { name: /tokens/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Cry')).not.toBeInTheDocument()
  })

  it('keeps token events and costs readable for historical token seasons', async () => {
    vi.mocked(api.get).mockResolvedValue(response(true))
    renderWithApp(<RulesPage />)

    expect(await screen.findByRole('heading', { name: 'Advantages and tokens' })).toBeVisible()
    expect(screen.getByText('Cry')).toBeVisible()
    expect(screen.getByText('+5 tokens')).toBeVisible()
    expect(screen.getByText('5 tokens')).toBeVisible()
  })

  it('provides a short how-to-play section and scannable rules', async () => {
    vi.mocked(api.get).mockResolvedValue(response(false))
    renderWithApp(<RulesPage />)

    expect(await screen.findByRole('heading', { name: 'How to play' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Pick your roster' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Submit a weekly ballot' })).toBeVisible()
    expect(await screen.findByRole('navigation', { name: 'Rules contents' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Weekly ballot' })).toHaveAttribute('href', '#ballot')
    expect(screen.getByText(/Swaps close at Episode 10/)).toBeVisible()
    expect(screen.getAllByText(/Episode 12/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Privacy' })).toBeVisible()
    expect(screen.getByText(/Roster changes are visible/)).toBeVisible()
    expect(screen.queryByText(/Episode schedule and contestant photos from/)).not.toBeInTheDocument()
  })
})
