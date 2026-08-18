import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { useAuth } from '../auth/useAuth'
import type { UserProfile } from '../types'
import { PageLoader } from '../components/PageLoader'

export function JoinPage() {
  const { session, profile, loading, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <PageLoader label="Getting your league ready…" />
  if (!session) return <Navigate to="/login" replace />
  if (profile) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.post<UserProfile>('/join', {
        display_name: displayName.trim(),
        join_code: joinCode.trim(),
      })
      await refreshProfile()
      void navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the league. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto mt-4 max-w-lg rounded-2xl border border-cream-200 bg-white p-5 shadow-sm sm:mt-10 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-terracotta-700">Private league</p>
      <h1 className="mt-1 font-display text-3xl tracking-wide text-forest-800">Join your league</h1>
      <p className="mt-2 text-sm leading-6 text-gray-600">
        Signed in as <span className="font-medium text-gray-800">{session.user.email}</span>. Choose the name other players will see, then enter your join code.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4" aria-describedby={error ? 'join-error' : undefined}>
        <div>
          <label htmlFor="join-display-name" className="mb-1 block text-sm font-medium text-gray-700">Display name</label>
          <input
            id="join-display-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={40}
            autoComplete="name"
            enterKeyHint="next"
            className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">This is how you will appear in standings.</p>
        </div>
        <div>
          <label htmlFor="join-code" className="mb-1 block text-sm font-medium text-gray-700">Join code</label>
          <input
            id="join-code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-base tracking-wide focus:outline-none focus:ring-2 focus:ring-forest-500 sm:text-sm"
          />
        </div>
        {error && <p id="join-error" role="alert" className="rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-700">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !displayName.trim() || !joinCode.trim()}
          className="min-h-11 w-full cursor-pointer rounded-lg bg-jade-600 px-4 py-2 text-sm font-semibold text-white hover:bg-jade-700 disabled:opacity-50"
        >
          {submitting ? 'Joining league…' : 'Join league'}
        </button>
      </form>
    </div>
  )
}
