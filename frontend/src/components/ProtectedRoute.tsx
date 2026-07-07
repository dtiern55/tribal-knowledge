import { Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth()
  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/join" replace />
  return <>{children}</>
}
