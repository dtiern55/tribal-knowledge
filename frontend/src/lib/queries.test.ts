import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { queryClient } from './queries'

/** A 204 for any write, so `api.*` gets past `apiFetch` without a real server. */
function stubFetch() {
  const fetched = vi.fn().mockResolvedValue({ ok: true, status: 204 })
  vi.stubGlobal('fetch', fetched)
  return fetched
}

describe('the write backstop', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fires for a plain write and not for a quiet one (#816)', async () => {
    stubFetch()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')

    // Scoring an episode names nothing it changed, so everything cached goes.
    await api.post('/episodes/ep-1/score', {})
    expect(invalidate).toHaveBeenCalledTimes(1)

    // A write that invalidates its own reads must not drag the whole cache with
    // it — that blanket refetch is what `useApiMutation` exists to avoid.
    invalidate.mockClear()
    await api.quiet.post('/episodes/ep-1/scoring-events', [])
    expect(invalidate).not.toHaveBeenCalled()
    invalidate.mockRestore()
  })

  it('still empties the 30s read cache when it is quiet', async () => {
    const fetched = stubFetch()
    fetched.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve([]) })

    await api.get('/episodes/ep-1/eliminations')
    await api.get('/episodes/ep-1/eliminations')
    expect(fetched).toHaveBeenCalledTimes(1) // held, as the cache should

    await api.quiet.delete('/eliminations/elim-1')
    await api.get('/episodes/ep-1/eliminations')
    expect(fetched).toHaveBeenCalledTimes(3)
  })
})
