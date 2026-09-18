import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, clearApiCache } from './api'

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

describe('api.get', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    clearApiCache()
  })

  /** A fetch that answers every call with the same body, counting calls. */
  function stubFetch(body: unknown = [{ id: 'season-1' }]) {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

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

    // Settled, and now held: the next caller is answered from the cache.
    expect(await api.get('/league-seasons')).toEqual([{ id: 'season-1' }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('answers from the cache for a while, then asks again (#814)', async () => {
    const fetchMock = stubFetch()
    await api.get('/seasons/show-1/cast')
    await api.get('/seasons/show-1/cast')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Half a minute on, the answer is stale enough to ask again.
    const later = Date.now() + 31_000
    vi.spyOn(Date, 'now').mockReturnValue(later)
    await api.get('/seasons/show-1/cast')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('forgets everything it read once this client writes (#814)', async () => {
    const fetchMock = stubFetch()
    await api.get('/league-seasons/ls-1/roster/user-1')
    await api.get('/league-seasons/ls-1/standings')
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // A swap invalidates far more than the path it posts to, so the whole
    // cache goes rather than a guess at which reads it touched.
    await api.post('/league-seasons/ls-1/roster', { contestant_id: 'c-1' })
    await api.get('/league-seasons/ls-1/roster/user-1')
    await api.get('/league-seasons/ls-1/standings')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('drops what it read when the session changes (#814)', async () => {
    const fetchMock = stubFetch()
    await api.get('/me')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // One player's reads must never be served to the next.
    clearApiCache()
    await api.get('/me')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
