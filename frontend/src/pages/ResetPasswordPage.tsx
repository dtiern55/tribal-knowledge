import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { AuthScene } from '../components/AuthScene'
import { PageLoader } from '../components/PageLoader'

/**
 * Set a new password (#508). Reached by tapping the emailed reset link, which
 * detectSessionInUrl turns into a recovery session — so by the time we render
 * there is already a session and updateUser can set the new password.
 */
export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <PageLoader label="Loading…" />
  // No session means an expired/consumed link (or a direct visit) — send them
  // back to sign in to request a fresh one.
  if (!session) return <Navigate to="/login" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }
    // Now signed in with the new password; the redirect lands on My Season.
    void navigate('/', { replace: true })
  }

  return (
    <AuthScene eyebrow="Reset password">
      <h2 className="font-display text-2xl tracking-wide text-forest-800">Choose a new password</h2>
      <p className="mt-1 text-sm leading-6 text-gray-600">
        For <span className="font-medium text-gray-800">{session.user.email}</span>.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4" aria-describedby={error ? 'reset-error' : undefined}>
        <div>
          <label htmlFor="reset-password" className="mb-1 block text-sm font-medium text-gray-700">New password</label>
          <input
            id="reset-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            autoFocus
            className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 sm:text-sm"
          />
        </div>
        {error && <p id="reset-error" role="alert" className="rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 w-full cursor-pointer rounded-lg bg-jade-600 px-4 py-2 text-sm font-semibold text-white hover:bg-jade-700 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthScene>
  )
}
