import { beforeEach, describe, expect, it, vi } from 'vitest'
import { lockPhrase } from './time'

/** The badge and the hero's sub-line both escalate off this, so the thresholds
 *  are the contract between them (#56). */
describe('lockPhrase', () => {
  const now = new Date('2026-08-27T12:00:00Z')
  const at = (mins: number) => new Date(now.getTime() + mins * 60_000).toISOString()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  it('counts down in minutes inside the final hour', () => {
    expect(lockPhrase(at(42))).toEqual({ state: 'imminent', text: 'in 42m' })
    expect(lockPhrase(at(59))).toEqual({ state: 'imminent', text: 'in 59m' })
  })

  it('counts down in hours inside the last day', () => {
    expect(lockPhrase(at(60))).toEqual({ state: 'soon', text: 'in 1h' })
    expect(lockPhrase(at(23 * 60))).toEqual({ state: 'soon', text: 'in 23h' })
  })

  it('names the day once the lock is further off', () => {
    expect(lockPhrase(at(24 * 60)).state).toBe('far')
  })

  it('is locked once the time passes, or once the episode is scored', () => {
    expect(lockPhrase(at(-1)).state).toBe('locked')
    expect(lockPhrase(at(500), true).state).toBe('locked')
  })
})
