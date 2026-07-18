import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api } from '../lib/api'
import type { UserProfile } from '../types'
import { supabase } from '../lib/supabase'
import { AuthContext } from './context'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile() {
    try {
      const p = await api.get<UserProfile>('/me')
      setProfile(p)
    } catch {
      setProfile(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      // Await the profile so we never render with session-but-no-profile,
      // which flashes the Join page before redirecting back (#93).
      if (data.session) await fetchProfile()
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
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
      value={{ session, profile, loading, signOut, refreshProfile: fetchProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}
