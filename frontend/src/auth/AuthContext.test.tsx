import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'
import { queryClient } from '../lib/queries'
import { AuthProvider } from './AuthContext'

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  api: { get: vi.fn() },
}))

/** Hand back the listener the provider registered, so a test can play a
 *  sign-out or a token refresh through it. */
function authEvents() {
  const calls = vi.mocked(supabase.auth.onAuthStateChange).mock.calls
  return calls[calls.length - 1]![0]
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({ id: 'user-1', display_name: 'A', is_admin: false, leagues: [] })
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never)
  })

  it("drops one player's cached reads when another signs in (#816)", async () => {
    const clear = vi.spyOn(queryClient, 'clear')
    render(<AuthProvider>app</AuthProvider>)
    await waitFor(() => expect(supabase.auth.onAuthStateChange).toHaveBeenCalled())
    const onChange = authEvents()

    onChange('SIGNED_IN', { user: { id: 'player-a' } } as never)
    expect(clear).toHaveBeenCalledTimes(1)

    // The same player's token refreshing is not a new player: clearing here
    // would empty every open page's data roughly once an hour.
    onChange('TOKEN_REFRESHED', { user: { id: 'player-a' } } as never)
    expect(clear).toHaveBeenCalledTimes(1)

    // Signing out, and someone else signing in, both have to take the cache
    // with them — invalidation alone would show A's league to B for a beat.
    onChange('SIGNED_OUT', null as never)
    expect(clear).toHaveBeenCalledTimes(2)
    onChange('SIGNED_IN', { user: { id: 'player-b' } } as never)
    expect(clear).toHaveBeenCalledTimes(3)
  })
})
