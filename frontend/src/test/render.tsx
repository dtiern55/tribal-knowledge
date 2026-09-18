import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { render } from '@testing-library/react'
import type { RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AuthContext } from '../auth/context'
import type { AuthContextValue } from '../auth/context'

const authenticated: AuthContextValue = {
  session: { access_token: 'test-token' } as Session,
  profile: { id: 'user-1', display_name: 'Test Player', is_admin: false, leagues: [{ id: 'league-1', name: 'Snakes and Rats' }] },
  profileError: false,
  loading: false,
  signOut: async () => undefined,
  refreshProfile: async () => undefined,
}

interface AppRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string
  auth?: Partial<AuthContextValue>
  /** How long an answer outlives the last component watching it. Zero keeps
   *  one test's cache out of the next, but it also drops a *failed* read the
   *  moment its component unmounts — where the app holds one for five minutes
   *  and hands it back, error and all, to whatever mounts next. A test about
   *  that has to say so. */
  gcTime?: number
  /** A client the test holds itself. The only way to reach a gate's behaviour
   *  on a *retry* — what a window focus or a write's invalidate does — is to
   *  refetch an already-settled query, which needs a handle on the cache. */
  client?: QueryClient
}

/** Render with deterministic router and auth seams; mock `lib/api` in the
 * test whenever the component performs requests. */
export function renderWithApp(
  ui: React.ReactNode,
  { route = '/', auth, gcTime = 0, client, ...options }: AppRenderOptions = {},
) {
  // A cache per render, so one test's answers never reach the next, and no
  // retries so a rejected request surfaces as the error state immediately.
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime } },
    })
  return render(
    <QueryClientProvider client={queryClient}>
    <AuthContext.Provider value={{ ...authenticated, ...auth }}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthContext.Provider>
    </QueryClientProvider>,
    options,
  )
}
