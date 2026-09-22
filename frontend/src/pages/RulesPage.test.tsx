import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { RulesResponse, Season } from '../types'
import { renderWithApp } from '../test/render'
import { RulesPage } from './RulesPage'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  api: { get: vi.fn() },
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

function response(overrides: Partial<RulesResponse> = {}): RulesResponse {
  return {
    season,
    scoring_events: [
      { event_type: 'win_individual_immunity', label: 'Win individual immunity', point_value: 15, postmerge_point_value: null, token_value: 0, is_per_unit: false },
      { event_type: 'vote_correctly_at_tribal', label: 'Vote correctly at tribal', point_value: 3, postmerge_point_value: 5, token_value: 0, is_per_unit: false },
      { event_type: 'win_redemption_duel', label: 'Win a duel to stay in the game', point_value: 4, postmerge_point_value: null, token_value: 0, is_per_unit: false },
      { event_type: 'return_from_redemption', label: 'Return to the game at the merge', point_value: 12, postmerge_point_value: null, token_value: 0, is_per_unit: false },
      { event_type: 'return_from_redemption_endgame', label: 'Return to the game in the endgame', point_value: 15, postmerge_point_value: null, token_value: 0, is_per_unit: false },
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
    ...overrides,
  }
}

describe('RulesPage', () => {
  beforeEach(() => vi.clearAllMocks())

  /** The page reads the league-season list and picks the active one from it,
   *  then that season's rules. */
  function serve(rules: RulesResponse) {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path === '/league-seasons' ? [season] : rules,
    )
  }

  it('states the season rules in words with the known numbers filled in', async () => {
    serve(response())
    renderWithApp(<RulesPage />)

    expect(await screen.findByRole('heading', { name: 'The basics' })).toBeVisible()
    for (const name of ['Tribe', 'Swaps', 'Ballot', 'Weekly advantage', 'Sole Survivor', 'Scoring', 'Rulings', 'Twists']) {
      expect(screen.getByRole('heading', { name })).toBeVisible()
    }
    expect(screen.getByText(/-10, -15, -20, then -25/)).toBeVisible()
    expect(screen.getByText(/Swap as often as you like/)).toBeVisible()
    for (const tier of ['Episodes 2 to 5: 3 picks', 'Episodes 6 to 10: 2 picks', 'Episode 11 on: 1 pick']) {
      expect(screen.getByText(tier)).toBeVisible()
    }
    expect(screen.getByText('+16 before merge, +20 after')).toBeVisible()
    expect(screen.queryByText(/roster/i)).not.toBeInTheDocument()
  })

  it('leaves the numbers out while a live season has not set them', async () => {
    serve(response({ season: { ...season, swap_lock_episode: null, merge_episode: null, elimination_pick_schedule: [] } }))
    renderWithApp(<RulesPage />)

    // Swaps still show a number: the lock defaults to episode 8, so the last
    // swappable episode is 7 even when the season sets nothing explicit.
    expect(await screen.findByText(/Swap as often as you like until the Episode 7 lock/)).toBeVisible()
    expect(screen.getByText(/You get 3 picks an episode/)).toBeVisible()
  })

  it('groups tribe scoring and always shows the twists', async () => {
    serve(response())
    renderWithApp(<RulesPage />)

    expect(await screen.findByRole('heading', { name: 'Challenges' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Tribal Council' })).toBeVisible()
    expect(screen.getByText('+3 before merge, +5 after')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Other' })).toBeVisible()
    expect(screen.getByText('Mystery event')).toBeVisible()
    expect(screen.queryByText('Cry')).not.toBeInTheDocument()
    expect(screen.getByText('Win a duel to stay in the game')).toBeVisible()
    expect(screen.getByText('Return to the game at the merge')).toBeVisible()
    expect(screen.getByText('Return to the game in the endgame')).toBeVisible()
    expect(screen.getByText(/counts as the boot on your ballot but is still in the game/)).toBeVisible()
  })

  it('scrolls to and flashes the section a deep link names', async () => {
    serve(response())
    Element.prototype.scrollIntoView = vi.fn()
    renderWithApp(<RulesPage />, { route: '/rules#swaps' })

    const section = (await screen.findByRole('heading', { name: 'Swaps' })).closest('section')
    // The class lands in a passive effect, which can flush after the heading
    // query resolves — assert on it rather than reading it synchronously.
    await waitFor(() => expect(section).toHaveClass('rule-flash'))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('lists ballot picks with the Power Vote first and plainly labeled ranks', async () => {
    serve(response({
        prediction_scores: [
          { key: 'correct_elimination_1', label: 'Correct 1st pick', point_value: 20, postmerge_point_value: 25 },
          { key: 'correct_elimination_2', label: 'Correct 2nd pick', point_value: 16, postmerge_point_value: 20 },
          { key: 'correct_elimination_3', label: 'Correct 3rd pick', point_value: 12, postmerge_point_value: 15 },
          { key: 'power_vote', label: 'Power Vote hits', point_value: 30, postmerge_point_value: 35 },
        ],
      }))
    renderWithApp(<RulesPage />)

    const powerVote = await screen.findByText('Power Vote')
    const firstPick = screen.getByText('1st pick')
    expect(screen.getByText('2nd pick')).toBeVisible()
    expect(screen.getByText('3rd pick')).toBeVisible()
    // Power Vote sits above the ranked picks.
    expect(powerVote.compareDocumentPosition(firstPick) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('groups the finale ladder one row per slate, in bracket order', async () => {
    serve(response({
        prediction_scores: [
          { key: 'correct_winner_vote', label: 'Correct winner vote (finale)', point_value: 60, postmerge_point_value: null },
          { key: 'correct_final_three_3', label: '3rd correct Final 3 name', point_value: 40, postmerge_point_value: null },
          { key: 'correct_final_four_1', label: '1st correct Final 4 name', point_value: 2, postmerge_point_value: null },
          { key: 'correct_final_four_2', label: '2nd correct Final 4 name', point_value: 4, postmerge_point_value: null },
          { key: 'correct_final_four_3', label: '3rd correct Final 4 name', point_value: 8, postmerge_point_value: null },
          { key: 'correct_final_four_4', label: '4th correct Final 4 name', point_value: 16, postmerge_point_value: null },
          { key: 'correct_final_three_1', label: '1st correct Final 3 name', point_value: 10, postmerge_point_value: null },
          { key: 'correct_final_three_2', label: '2nd correct Final 3 name', point_value: 20, postmerge_point_value: null },
        ],
      }))
    renderWithApp(<RulesPage />)

    // One row per slate, in bracket order and not the value order the API
    // returns them in (#877): the rungs go by how many names you got right,
    // not by the order you picked them, so an ordinal per rung would mislead
    // (#884). No running total either — beside a points column it reads as a
    // bonus for a clean sweep, and there is no bonus.
    const rule = await screen.findByText(/Each additional correct pick in these categories earns double points/)
    const block = document.getElementById('finale')!
    expect(block).toContainElement(rule)
    // The worked figures are the rungs added up, not a bonus for a sweep, so
    // they have to stay tied to the category they belong to.
    expect(rule).toHaveTextContent('30 points for that category')
    expect(rule).toHaveTextContent('picking all 3 perfectly would earn 70 points')
    expect([...block.querySelectorAll('li')].map((row) => row.textContent)).toEqual([
      'Final 42 · 4 · 8 · 16 pts',
      'Final 310 · 20 · 40 pts',
      'Winner60 pts',
    ])
  })

  it('files the finale bracket under Scoring, keeping the #finale anchor', async () => {
    serve(response())
    renderWithApp(<RulesPage />)

    const block = await screen.findByText('Finale bracket')
    expect(block.parentElement).toHaveAttribute('id', 'finale')
    // Last of the Scoring tables, below the tribe events and the ballot picks.
    expect(block.closest('section')).toHaveAttribute('id', 'scoring')
  })

  it('keeps the flat finale rows for a season that predates the ladder', async () => {
    serve(response({
        prediction_scores: [
          { key: 'correct_final_four', label: 'Correct Final 4 pick', point_value: 6, postmerge_point_value: null },
          { key: 'correct_final_three', label: 'Correct Final 3 pick', point_value: 8, postmerge_point_value: null },
          { key: 'perfect_final_three', label: 'Perfect Final 3 (all three)', point_value: 12, postmerge_point_value: null },
          { key: 'correct_winner_vote', label: 'Correct winner vote (finale)', point_value: 40, postmerge_point_value: null },
        ],
      }))
    renderWithApp(<RulesPage />)

    expect(await screen.findByText('Correct Final 4 pick')).toBeVisible()
    expect(screen.getByText('Perfect Final 3 (all three)')).toBeVisible()
  })
})
