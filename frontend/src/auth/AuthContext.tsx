import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api, ApiError, clearApiCache } from '../lib/api'
import { queryClient } from '../lib/queries'
import { supabase } from '../lib/supabase'
import type { UserProfile } from '../types'
import { AuthContext } from './context'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(false)

  async function fetchProfile() {
    try {
      const p = await api.get<UserProfile>('/me')
      setProfile(p)
      setProfileError(false)
    } catch (e) {
      // Only a 404 means "no profile yet". Anything else (a Fly machine
      // still waking, a dropped mobile connection, a stale token) used to
      // clear the profile too, which sent a signed-in member to the Join
      // page as if they had never joined.
      if (e instanceof ApiError && e.status === 404) setProfile(null)
      else setProfileError(true)
    }
  }

  useEffect(() => {
    // Which account the cached reads belong to. A token refresh fires the
    // listener below roughly hourly with the same user, and throwing the
    // caches away then would spinner every open page for nothing.
    let cachedFor: string | undefined
    supabase.auth.getSession().then(async ({ data }) => {
      cachedFor = data.session?.user?.id
      setSession(data.session)
      // Await the profile so we never render with session-but-no-profile,
      // which flashes the Join page before redirecting back (#93).
      if (data.session) await fetchProfile()
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const arriving = session?.user?.id
      if (arriving !== cachedFor) {
        cachedFor = arriving
        // Not just invalidated: invalidation keeps the old body on screen
        // while it refetches, which would show one player another's league
        // for a beat. Their reads have to be gone (#816).
        clearApiCache()
        queryClient.clear()
      }
      if (session) {
        // Same rule as the boot path above (#93): only expose the session
        // once the profile is loaded, or ProtectedRoute sees
        // session-but-no-profile and flashes the Join page on every
        // sign-in (#116). Deferred rather than awaited — supabase-js
        // holds its auth lock until this callback returns.
        void fetchProfile().then(() => setSession(session))
      } else {
        setSession(null)
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, profileError, loading, signOut, refreshProfile: fetchProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}
