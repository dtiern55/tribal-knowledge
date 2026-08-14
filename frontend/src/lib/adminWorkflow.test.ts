import { describe, expect, it } from 'vitest'
import type { Episode, Season } from '../types'
import { commissionerContext, commissionerEpisodeLabel } from './adminWorkflow'

const season = { status: 'active' } as Season
const now = new Date('2026-08-14T00:00:00Z')

function episode(number: number, lock: string, status = 'upcoming'): Episode {
  return { episode_number: number, picks_lock_at: lock, status } as Episode
}

describe('commissioner workflow context', () => {
  it('moves from setup to scheduling to review in episode order', () => {
    expect(commissionerContext(season, [], now).stage).toBe('setup')
    expect(commissionerContext(season, [episode(2, '2026-08-15T00:00:00Z')], now)).toMatchObject({ stage: 'scheduled', episode: { episode_number: 2 } })
    expect(commissionerContext(season, [episode(3, '2026-08-20T00:00:00Z'), episode(2, '2026-08-13T00:00:00Z')], now)).toMatchObject({ stage: 'review', episode: { episode_number: 2 } })
  })

  it('treats an explicitly completed season or fully scored schedule as complete', () => {
    expect(commissionerContext({ ...season, status: 'completed' }, [episode(1, '2026-01-01T00:00:00Z')], now).stage).toBe('complete')
    expect(commissionerContext(season, [episode(1, '2026-01-01T00:00:00Z', 'scored')], now).stage).toBe('complete')
  })

  it('uses commissioner-facing episode labels instead of raw database status', () => {
    expect(commissionerEpisodeLabel(episode(1, '2026-08-15T00:00:00Z'), now)).toBe('Scheduled')
    expect(commissionerEpisodeLabel(episode(1, '2026-08-13T00:00:00Z'), now)).toBe('Ready to score')
    expect(commissionerEpisodeLabel(episode(1, '2026-08-13T00:00:00Z', 'scored'), now)).toBe('Scored')
  })
})
