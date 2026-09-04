import { describe, expect, it, vi } from 'vitest'
import type { Episode, Season } from '../types'
import { airingEpisode, openEpisode, ssDesignationOpen, ssWindowOpenYet } from './episodes'

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
    title: null,
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

describe('sole survivor designation window', () => {
  const ssSeason = {
    roster_lock_episode: 2,
    merge_episode: 7,
    swap_lock_episode: 9,
    status: 'active',
  } as Season

  it('stays closed until the merge episode is the open one', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
    const episodes = [
      episode(1, '2026-08-20T00:00:00Z', 'scored'),
      episode(2, '2026-09-05T00:00:00Z'),
      episode(7, '2026-10-10T00:00:00Z'),
      episode(9, '2026-10-24T00:00:00Z'),
    ]
    expect(openEpisode(episodes, ssSeason)?.episode_number).toBe(2)
    expect(ssWindowOpenYet(ssSeason, episodes)).toBe(false)
    expect(ssDesignationOpen(ssSeason, episodes)).toBe(false)
    vi.useRealTimers()
  })

  it('opens once the merge episode is open, until the lock episode locks', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T00:00:00Z'))
    const episodes = [
      episode(2, '2026-09-05T00:00:00Z', 'scored'),
      episode(7, '2026-10-14T00:00:00Z'),
      episode(9, '2026-10-28T00:00:00Z'),
    ]
    expect(openEpisode(episodes, ssSeason)?.episode_number).toBe(7)
    expect(ssWindowOpenYet(ssSeason, episodes)).toBe(true)
    expect(ssDesignationOpen(ssSeason, episodes)).toBe(true)
    vi.useRealTimers()
  })

  it('ignores the merge gate when no merge is set', () => {
    const noMerge = {
      roster_lock_episode: 2,
      swap_lock_episode: 9,
      status: 'active',
    } as Season
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
    const episodes = [
      episode(2, '2026-09-05T00:00:00Z'),
      episode(9, '2026-10-24T00:00:00Z'),
    ]
    expect(ssWindowOpenYet(noMerge, episodes)).toBe(false)
    expect(ssDesignationOpen(noMerge, episodes)).toBe(false)
    vi.useRealTimers()
  })
})
