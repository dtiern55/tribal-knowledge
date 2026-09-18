import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, clearApiCache } from './api'

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}))

/** A fetch nobody answers until `answerAll` is called, so a request can be
 *  held in the air for as long as a test needs it there. */
function deferredFetch(body: unknown = [{ id: 'season-1' }]) {
  const answers: (() => void)[] = []
  const fetchMock = vi.fn(
    () =>
      new Promise((resolve) => {
        answers.push(() => resolve({ ok: true, status: 200, json: async () => body }))
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, answerAll: () => answers.forEach((answer) => answer()) }
}

/** apiFetch awaits the auth session before it fetches; let that drain. */
const sent = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('api.get', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    clearApiCache()
  })

  it('shares a GET already in the air, and sends again once it has settled (#803)', async () => {
    const { fetchMock, answerAll } = deferredFetch()

    const both = Promise.all([api.get('/league-seasons'), api.get('/league-seasons')])
    await sent()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    answerAll()
    const [first, second] = await both
    expect(first).toEqual([{ id: 'season-1' }])
    expect(second).toBe(first)

    // Settled, and nothing is held: the answers live in the query cache now
    // (#816), so the next caller here is a fresh request.
    const third = api.get('/league-seasons')
    await sent()
    answerAll()
    expect(await third).toEqual([{ id: 'season-1' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('drops a read a write has overtaken (#814)', async () => {
    const { fetchMock, answerAll } = deferredFetch()

    const beforeWrite = api.get('/league-seasons/ls-1/standings')
    await sent()
    // A swap lands while the standings read is still out. The refetch it
    // triggers must be a new question, not the one asked before the swap —
    // sharing that request would store a pre-write answer as the fresh one.
    const write = api.post('/league-seasons/ls-1/roster', { contestant_id: 'c-1' })
    await sent()
    answerAll()
    await write

    const afterWrite = api.get('/league-seasons/ls-1/standings')
    await sent()
    answerAll()
    await Promise.all([beforeWrite, afterWrite])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('drops what it is reading when the session changes (#814)', async () => {
    const { fetchMock, answerAll } = deferredFetch()

    const beforeSignOut = api.get('/me')
    await sent()
    // One player's reads must never be served to the next.
    clearApiCache()
    const afterSignIn = api.get('/me')
    await sent()
    answerAll()
    await Promise.all([beforeSignOut, afterSignIn])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
