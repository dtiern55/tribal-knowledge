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

    expect(await screen.findByRole('heading', { name: 'Weekly play — one choice each episode' })).toBeVisible()
    expect(screen.getByText(/every correct elimination pick/)).toBeVisible()
    expect(screen.queryByRole('heading', { name: /Tokens/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Cry')).not.toBeInTheDocument()
    expect(screen.queryByText(/tkn/)).not.toBeInTheDocument()
  })

  it('keeps token events and costs readable for historical token seasons', async () => {
    vi.mocked(api.get).mockResolvedValue(response(true))
    renderWithApp(<RulesPage />)

    expect(await screen.findByRole('heading', { name: 'Tokens — the second currency' })).toBeVisible()
    expect(screen.getByText('Cry')).toBeVisible()
    expect(screen.getByText('+5 tkn')).toBeVisible()
    expect(screen.getByText('5 tkn')).toBeVisible()
  })
})
