import { describe, expect, it, vi } from 'vitest'
import type { Episode, Season } from '../types'
import { advantagesOpenYet, airingEpisode, openEpisode, ssDesignationOpen, swapLockEpisodeNumber } from './episodes'

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

describe('advantagesOpenYet', () => {
  it('stays closed through the watch-only premiere, opens once it is scored', () => {
    // roster locks at episode 2 (see `season`), so episode 1 is watch-only.
    const pending = [episode(1, '2026-08-20T00:00:00Z'), episode(2, '2026-08-27T00:00:00Z')]
    expect(advantagesOpenYet(season, pending)).toBe(false)
    const premiereDone = [episode(1, '2026-08-20T00:00:00Z', 'scored'), episode(2, '2026-08-27T00:00:00Z')]
    expect(advantagesOpenYet(season, premiereDone)).toBe(true)
  })

  it('opens at episode 1 when the roster locks there (no watch-only premiere)', () => {
    const rle1 = { roster_lock_episode: 1 } as Season
    expect(advantagesOpenYet(rle1, [episode(1, '2026-08-20T00:00:00Z')])).toBe(true)
  })
})

describe('swapLockEpisodeNumber', () => {
  it('prefers the explicit lock, else the default (ep 8)', () => {
    expect(swapLockEpisodeNumber({ swap_lock_episode: 9 } as Season)).toBe(9)
    expect(swapLockEpisodeNumber({ swap_lock_episode: null } as Season)).toBe(8)
    expect(swapLockEpisodeNumber({} as Season)).toBe(8)
  })
})

describe('sole survivor designation window', () => {
  // One dial, no merge: with the lock at ep9 the pick opens going into ep8
  // (the last swappable episode) and locks when ep8 locks — same as the swaps.
  const ssSeason = {
    roster_lock_episode: 2,
    swap_lock_episode: 9,
    status: 'active',
  } as Season

  it('stays closed before the last swappable episode is the open one', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    const episodes = [
      episode(2, '2026-09-05T00:00:00Z', 'scored'),
      episode(7, '2026-10-10T00:00:00Z'),
      episode(8, '2026-10-17T00:00:00Z'),
      episode(9, '2026-10-24T00:00:00Z'),
    ]
    expect(openEpisode(episodes, ssSeason)?.episode_number).toBe(7)
    expect(ssDesignationOpen(ssSeason, episodes)).toBe(false)
    vi.useRealTimers()
  })

  it('opens going into the last swappable episode (lock - 1)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-11T00:00:00Z'))
    const episodes = [
      episode(7, '2026-10-10T00:00:00Z', 'scored'),
      episode(8, '2026-10-17T00:00:00Z'),
      episode(9, '2026-10-24T00:00:00Z'),
    ]
    expect(openEpisode(episodes, ssSeason)?.episode_number).toBe(8)
    expect(ssDesignationOpen(ssSeason, episodes)).toBe(true)
    vi.useRealTimers()
  })

  it('locks with the swaps once the lock episode is the open one', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T00:00:00Z'))
    const episodes = [
      episode(7, '2026-10-10T00:00:00Z', 'scored'),
      episode(8, '2026-10-17T00:00:00Z', 'scored'),
      episode(9, '2026-10-24T00:00:00Z'),
    ]
    expect(openEpisode(episodes, ssSeason)?.episode_number).toBe(9)
    expect(ssDesignationOpen(ssSeason, episodes)).toBe(false)
    vi.useRealTimers()
  })
})
