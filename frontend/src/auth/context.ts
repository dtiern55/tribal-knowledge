import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { UserProfile } from '../types'

export interface AuthContextValue {
  session: Session | null
  profile: UserProfile | null
  /** The last profile fetch failed for a reason other than "no profile". */
  profileError: boolean
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
