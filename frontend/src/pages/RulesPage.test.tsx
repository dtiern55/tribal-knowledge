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
  advantage_lock_episode: null,
  swap_lock_episode: 10,
  swap_token_cost: 20,
  swap_penalty_step: -5,
  swap_penalty_floor: -25,
  free_swaps: 1,
  token_economy_enabled: false,
  elimination_pick_schedule: [
    { from_episode: 6, picks: 2 },
    { from_episode: 2, picks: 3 },
    { from_episode: 11, picks: 1 },
  ],
} as Season

function response(overrides: Partial<RulesResponse> = {}, tokenMode = false): RulesResponse {
  return {
    season: { ...season, token_economy_enabled: tokenMode },
    scoring_events: [
      { event_type: 'win_individual_immunity', label: 'Win individual immunity', point_value: 15, postmerge_point_value: null, token_value: 0, is_per_unit: false },
      { event_type: 'vote_correctly_at_tribal', label: 'Vote correctly at tribal', point_value: 3, postmerge_point_value: 5, token_value: 0, is_per_unit: false },
      { event_type: 'return_from_redemption', label: 'Return from Redemption Island', point_value: 12, postmerge_point_value: null, token_value: 0, is_per_unit: false },
      { event_type: 'mystery_event', label: 'Mystery event', point_value: 1, postmerge_point_value: null, token_value: 0, is_per_unit: false },
      { event_type: 'cry', label: 'Cry', point_value: 0, postmerge_point_value: null, token_value: 5, is_per_unit: false },
    ],
    prediction_scores: [
      { key: 'correct_elimination', label: 'Correct elimination prediction', point_value: 16, postmerge_point_value: 20 },
      { key: 'correct_winner_vote', label: 'Correct winner vote (finale)', point_value: 40, postmerge_point_value: null },
    ],
    advantages: [
      { advantage_type: 'double_vote_points', label: 'Double Vote Points', token_cost: 15, enabled: true },
      { advantage_type: 'extra_vote', label: 'Extra Vote', token_cost: 5, enabled: false },
    ],
    has_redemption: false,
    ...overrides,
  }
}

describe('RulesPage', () => {
  beforeEach(() => {
    vi.mocked(getActiveSeason).mockResolvedValue(season)
  })

  it('states the season rules in words with the known numbers filled in', async () => {
    vi.mocked(api.get).mockResolvedValue(response())
    renderWithApp(<RulesPage />)

    expect(await screen.findByRole('heading', { name: 'How it works' })).toBeVisible()
    for (const name of ['Tribe', 'Ballot', 'Weekly advantage', 'Sole Survivor', 'Finale', 'Scoring', 'Rulings']) {
      expect(screen.getByRole('heading', { name })).toBeVisible()
    }
    expect(screen.getByText(/-10, -15, -20, then -25/)).toBeVisible()
    expect(screen.getByText(/Episode 9 is the last one you can swap for/)).toBeVisible()
    expect(screen.getByText(/3 picks from Episode 2, 2 from Episode 6, 1 from Episode 11/)).toBeVisible()
    expect(screen.getByText(/worth 16\. After the merge, 20\./)).toBeVisible()
    expect(screen.getByText(/\(Episode 7\)/)).toBeVisible()
    expect(screen.queryByText(/roster/i)).not.toBeInTheDocument()
  })

  it('leaves the numbers out while a live season has not set them', async () => {
    vi.mocked(api.get).mockResolvedValue(
      response({ season: { ...season, swap_lock_episode: null, merge_episode: null, elimination_pick_schedule: [] } }),
    )
    renderWithApp(<RulesPage />)

    expect(await screen.findByText(/Swaps close after the episode that follows the first juror/)).toBeVisible()
    expect(screen.queryByText(/is the last one you can swap for/)).not.toBeInTheDocument()
    expect(screen.getByText(/You get 3 picks an episode/)).toBeVisible()
    expect(screen.queryByText(/\(Episode/)).not.toBeInTheDocument()
  })

  it('groups tribe scoring and hides Redemption Island unless the season has it', async () => {
    vi.mocked(api.get).mockResolvedValue(response())
    const { unmount } = renderWithApp(<RulesPage />)

    expect(await screen.findByRole('heading', { name: 'Challenges' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Tribal Council' })).toBeVisible()
    expect(screen.getByText('+3 before merge, +5 after')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Other' })).toBeVisible()
    expect(screen.getByText('Mystery event')).toBeVisible()
    expect(screen.queryByText(/Redemption Island/)).not.toBeInTheDocument()
    expect(screen.queryByText('Cry')).not.toBeInTheDocument()
    unmount()

    vi.mocked(api.get).mockResolvedValue(response({ has_redemption: true }))
    renderWithApp(<RulesPage />)
    expect(await screen.findByText('Return from Redemption Island')).toBeVisible()
    expect(screen.getByText(/counts as the boot on your ballot but is still in the game/)).toBeVisible()
  })

  it('keeps token events and costs readable for historical token seasons', async () => {
    vi.mocked(api.get).mockResolvedValue(response({}, true))
    renderWithApp(<RulesPage />)

    expect(await screen.findByRole('heading', { name: 'Advantages and tokens' })).toBeVisible()
    expect(screen.getByText('Cry')).toBeVisible()
    expect(screen.getByText('+5 tokens')).toBeVisible()
    expect(screen.getByText('5 tokens')).toBeVisible()
  })
})
