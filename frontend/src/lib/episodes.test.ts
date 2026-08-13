import { describe, expect, it, vi } from 'vitest'
import type { Episode, Season } from '../types'
import { airingEpisode, openEpisode } from './episodes'

const season = { roster_lock_episode: 2 } as Season

function episode(number: number, lock: string, status = 'upcoming'): Episode {
  return {
    id: `episode-${number}`,
    season_id: 'season-1',
    episode_number: number,
    air_date: lock.slice(0, 10),
    max_elimination_picks: 3,
    is_finale: false,
    picks_lock_at: lock,
    status,
    created_at: lock,
  }
}

describe('episode lifecycle helpers', () => {
  it('keeps the earliest playable episode authoritative before and after lock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
    const episodes = [
      episode(1, '2026-08-20T00:00:00Z'),
      episode(2, '2026-09-02T00:00:00Z'),
      episode(3, '2026-09-09T00:00:00Z'),
    ]

    expect(openEpisode(episodes, season)?.episode_number).toBe(2)
    expect(airingEpisode(episodes, season)).toBeUndefined()

    vi.setSystemTime(new Date('2026-09-03T00:00:00Z'))
    expect(openEpisode(episodes, season)).toBeUndefined()
    expect(airingEpisode(episodes, season)?.episode_number).toBe(2)
    vi.useRealTimers()
  })
})
