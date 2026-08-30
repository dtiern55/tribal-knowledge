import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Episode, Season } from '../types'
import { resolveMySeasonState } from './mySeasonState'

const NOW = new Date('2026-09-01T00:00:00Z')

function season(overrides: Partial<Season> = {}): Season {
  return {
    roster_lock_episode: 2,
    status: 'active',
    ...overrides,
  } as Season
}

function episode(
  number: number,
  { lock = '2026-09-02T00:00:00Z', status = 'upcoming', finale = false } = {},
): Episode {
  return {
    id: `episode-${number}`,
    season_id: 'season-1',
    episode_number: number,
    air_date: lock.slice(0, 10),
    max_elimination_picks: 3,
    is_finale: finale,
    picks_lock_at: lock,
    status,
    created_at: lock,
    title: null,
  }
}

describe('resolveMySeasonState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => vi.useRealTimers())

  it('gives completed seasons absolute precedence', () => {
    const result = resolveMySeasonState(
      season({ status: 'completed' }),
      [episode(1), episode(2)],
    )
    expect(result.kind).toBe('complete')
  })

  it('keeps an unscored watch-only premiere ahead of a later open episode', () => {
    const result = resolveMySeasonState(season(), [episode(1), episode(2)])
    expect(result).toMatchObject({ kind: 'watch_only', episode: { episode_number: 1 } })
  })

  it('opens the first playable episode after the premiere is scored', () => {
    const result = resolveMySeasonState(season(), [
      episode(1, { status: 'scored' }),
      episode(2),
      episode(3, { lock: '2026-09-09T00:00:00Z' }),
    ])
    expect(result).toMatchObject({ kind: 'open', episode: { episode_number: 2 } })
  })

  it('switches from open to locked exactly at the lock boundary', () => {
    const result = resolveMySeasonState(season(), [
      episode(1, { status: 'scored' }),
      episode(2, { lock: NOW.toISOString() }),
    ])
    expect(result).toMatchObject({ kind: 'locked', episode: { episode_number: 2 } })
  })

  it('keeps delayed scoring locked regardless of how old the lock is', () => {
    const result = resolveMySeasonState(season(), [
      episode(1, { status: 'scored' }),
      episode(2, { lock: '2026-08-01T00:00:00Z' }),
      episode(3, { lock: '2026-09-09T00:00:00Z' }),
    ])
    expect(result).toMatchObject({ kind: 'locked', episode: { episode_number: 2 } })
  })

  it('uses intermission when a scored episode has no next row', () => {
    expect(
      resolveMySeasonState(season(), [episode(1, { status: 'scored' })]),
    ).toEqual({ kind: 'intermission' })
  })

  it('treats a scored finale as complete even before the season status flips', () => {
    expect(
      resolveMySeasonState(season(), [
        episode(1, { status: 'scored' }),
        episode(2, { status: 'scored', finale: true }),
      ]),
    ).toEqual({ kind: 'complete' })
  })

  it('stays in intermission when the finale is locked but not yet scored', () => {
    expect(
      resolveMySeasonState(season(), [
        episode(1, { status: 'scored' }),
        episode(2, { status: 'upcoming', finale: true, lock: '2026-08-01T00:00:00Z' }),
      ]),
    ).toMatchObject({ kind: 'locked', episode: { episode_number: 2 } })
  })
})
