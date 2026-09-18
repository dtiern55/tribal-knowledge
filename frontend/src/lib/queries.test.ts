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

  // The 30s answer cache is gone now the last page reads through queries
  // (#816). What `lib/api.ts` still owns is the request in the air, and a
  // quiet write has to drop that too: the refetch it is about to ask for is
  // exactly the one that must not be handed a pre-write answer.
  it('drops a read the write overtook, quiet or not', async () => {
    const answers: (() => void)[] = []
    const fetched = vi.fn(
      () =>
        new Promise((resolve) => {
          answers.push(() => resolve({ ok: true, status: 200, json: async () => [] }))
        }),
    )
    vi.stubGlobal('fetch', fetched)
    // apiFetch awaits the auth session before it fetches; let that drain.
    const sent = async () => {
      await Promise.resolve()
      await Promise.resolve()
    }

    const beforeWrite = api.get('/episodes/ep-1/eliminations')
    await sent()
    const write = api.quiet.delete('/eliminations/elim-1')
    await sent()
    answers.forEach((answer) => answer())
    await write

    const refetch = api.get('/episodes/ep-1/eliminations')
    await sent()
    answers.forEach((answer) => answer())
    await Promise.all([beforeWrite, refetch])
    expect(fetched).toHaveBeenCalledTimes(3) // the read, the write, the refetch
  })
})
