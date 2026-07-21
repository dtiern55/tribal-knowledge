import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { armInstallNudge } from '../lib/install'
import { useAuth } from '../auth/useAuth'
import type { UserProfile } from '../types'

export function JoinPage() {
  const { session, profile, loading, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  if (profile) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.post<UserProfile>('/join', {
        display_name: displayName,
        join_code: joinCode,
      })
      armInstallNudge()
      await refreshProfile()
      void navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="marker-underline font-display text-2xl md:text-3xl tracking-wide text-ocean-800 mb-2">Join the league</h1>
      <p className="text-sm text-gray-500 mb-6">
        Ask a league admin for the join code.
      </p>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Display name
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={40}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Join code
          </label>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-jungle-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-jungle-700 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? 'Joining…' : 'Join'}
        </button>
      </form>
    </div>
  )
}
