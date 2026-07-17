import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'

export function LoginPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Don't flash the form while the session is still being restored (#1)
  if (loading) return null
  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setInfo(null)

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setSubmitting(false)
      } else {
        void navigate('/')
      }
      return
    }

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }
    if (data.session) {
      // Local dev / email confirmation disabled: already signed in.
      void navigate('/')
    } else {
      // Email confirmation required before a session exists.
      setInfo('Check your email to confirm your account, then sign in.')
      setMode('signin')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">
        {mode === 'signin' ? 'Sign in' : 'Sign up'}
      </h1>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-ocean-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-ocean-700 disabled:opacity-50 cursor-pointer"
        >
          {submitting
            ? mode === 'signin'
              ? 'Signing in…'
              : 'Signing up…'
            : mode === 'signin'
              ? 'Sign in'
              : 'Sign up'}
        </button>
      </form>
      <button
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError(null)
          setInfo(null)
        }}
        className="mt-4 text-sm text-ocean-600 hover:text-ocean-700 cursor-pointer"
      >
        {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
