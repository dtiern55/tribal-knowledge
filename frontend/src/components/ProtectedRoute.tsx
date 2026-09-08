import { Navigate } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { PageLoader } from './PageLoader'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, profileError, loading, refreshProfile } = useAuth()
  if (loading) return <PageLoader label="Restoring your session…" />
  if (!session) return <Navigate to="/login" replace />
  if (!profile && profileError) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center sm:py-24">
        <h1 className="font-display text-2xl tracking-wide text-forest-800">Couldn’t reach camp</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your league didn’t answer. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => void refreshProfile()}
          className="mt-6 min-h-11 cursor-pointer rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-800"
        >
          Try again
        </button>
      </div>
    )
  }
  if (!profile) return <Navigate to="/join" replace />
  return <>{children}</>
}
