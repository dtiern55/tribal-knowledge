import { describe, expect, it } from 'vitest'
import type { StandingEntry } from '../types'
import { movementLabel, rankStandings } from './standings'

function standing(total: number, trend: StandingEntry['trend'] = null): StandingEntry {
  return {
    user_id: String(total),
    display_name: `Player ${total}`,
    roster_points: total,
    elimination_points: 0,
    finale_points: 0,
    total_points: total,
    trend,
    trend_delta: 2,
    last_episode_points: 0,
    active_survivors: [],
  }
}

describe('standings presentation helpers', () => {
  it('uses competition ranks for tied leaders and tied zero-point players', () => {
    const ranked = rankStandings([standing(12), standing(12), standing(4), standing(0), standing(0)])
    expect(ranked.map(({ rank, tied }) => ({ rank, tied }))).toEqual([
      { rank: 1, tied: true },
      { rank: 1, tied: true },
      { rank: 3, tied: false },
      { rank: 4, tied: true },
      { rank: 4, tied: true },
    ])
  })

  it('describes movement without symbol-only abbreviations', () => {
    expect(movementLabel(standing(1, 'up'))).toBe('Up 2')
    expect(movementLabel(standing(1, 'down'))).toBe('Down 2')
    expect(movementLabel(standing(1, 'same'))).toBe('No change')
    expect(movementLabel(standing(1))).toBeNull()
  })
})
