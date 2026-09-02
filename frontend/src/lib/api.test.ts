import { describe, expect, it, vi } from 'vitest'
import type { Season } from '../types'

vi.mock('./supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }))

import { defaultSeason } from './api'

function season(over: Partial<Season>): Season {
  return {
    id: over.name ?? 'x',
    status: 'completed',
    practice: false,
    created_at: '2026-01-01',
    ...over,
  } as Season
}

describe('defaultSeason', () => {
  it('prefers the live active season over an active practice season', () => {
    const practice = season({ name: 'Practice', status: 'active', practice: true, created_at: '2026-09-01' })
    const live = season({ name: 'Live', status: 'active', created_at: '2026-08-01' })
    expect(defaultSeason([practice, live])?.name).toBe('Live')
  })

  it('falls back to any active season, then the newest created', () => {
    const practice = season({ name: 'Practice', status: 'active', practice: true })
    const old = season({ name: 'Old', created_at: '2025-01-01' })
    expect(defaultSeason([old, practice])?.name).toBe('Practice')
    const newer = season({ name: 'Newer', created_at: '2026-06-01' })
    expect(defaultSeason([old, newer])?.name).toBe('Newer')
    expect(defaultSeason([])).toBeNull()
  })
})
