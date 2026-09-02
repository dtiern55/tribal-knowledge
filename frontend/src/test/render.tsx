import type { Session } from '@supabase/supabase-js'
import { render } from '@testing-library/react'
import type { RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AuthContext } from '../auth/context'
import type { AuthContextValue } from '../auth/context'

const authenticated: AuthContextValue = {
  session: { access_token: 'test-token' } as Session,
  profile: { id: 'user-1', display_name: 'Test Player', is_admin: false, leagues: [{ id: 'league-1', name: 'Snakes and Rats' }] },
  loading: false,
  signOut: async () => undefined,
  refreshProfile: async () => undefined,
}

interface AppRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string
  auth?: Partial<AuthContextValue>
}

/** Render with deterministic router and auth seams; mock `lib/api` in the
 * test whenever the component performs requests. */
export function renderWithApp(
  ui: React.ReactNode,
  { route = '/', auth, ...options }: AppRenderOptions = {},
) {
  return render(
    <AuthContext.Provider value={{ ...authenticated, ...auth }}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
    options,
  )
}
