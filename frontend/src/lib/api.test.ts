import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

describe('api.get', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shares a GET already in the air, and sends again once it has settled (#803)', async () => {
    let resolve: (value: unknown) => void = () => {}
    const fetchMock = vi.fn(
      () =>
        new Promise((r) => {
          resolve = () => r({ ok: true, status: 200, json: async () => [{ id: 'season-1' }] })
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const both = Promise.all([api.get('/league-seasons'), api.get('/league-seasons')])
    // apiFetch awaits the auth session first, so let the microtasks drain.
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolve(null)
    const [first, second] = await both
    expect(first).toEqual([{ id: 'season-1' }])
    expect(second).toBe(first)

    // Settled, so the next caller reads fresh rather than a cached answer.
    void api.get('/league-seasons')
    await Promise.resolve()
    await Promise.resolve()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
