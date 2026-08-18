import { useState } from 'react'
import { Navigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { PageLoader } from '../components/PageLoader'

export function LoginPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Don't flash the form while the session is still being restored (#1)
  if (loading) return <PageLoader label="Restoring your session…" />
  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setInfo(null)

    // On success we deliberately don't navigate: AuthContext publishes the
    // session once the profile is loaded (#116), and the declarative
    // redirect above then fires exactly once — no Join-page flash.
    // `submitting` stays true so the button reads "Signing in…" meanwhile.
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setSubmitting(false)
      }
      return
    }

    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setSubmitting(false)
      return
    }
    if (!data.session) {
      // Email confirmation required before a session exists.
      setInfo('Check your email to confirm your account. Then come back and sign in.')
      setMode('signin')
      setSubmitting(false)
    }
    // else: local dev / confirmation disabled — already signed in, the
    // redirect above handles it.
  }

  return (
    <div className="mx-auto mt-4 grid max-w-3xl overflow-hidden rounded-2xl border border-cream-200 bg-white shadow-sm md:mt-10 md:grid-cols-[0.8fr_1.2fr]">
      <section className="bg-gradient-to-br from-forest-900 to-jade-800 p-6 text-white sm:p-8" aria-labelledby="welcome-title">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta-200">Private Survivor league</p>
        <h1 id="welcome-title" className="mt-2 font-display text-3xl tracking-wide">Welcome to Tribal Knowledge</h1>
      </section>

      <section className="p-5 sm:p-8" aria-labelledby="auth-form-title">
        <h2 id="auth-form-title" className="font-display text-2xl tracking-wide text-forest-800">
          {mode === 'signin' ? 'Sign in' : 'Create your account'}
        </h2>
        {mode === 'signup' && (
          <p className="mt-1 text-sm text-gray-500">You’ll need your league’s join code after signing up.</p>
        )}
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4" aria-describedby={error ? 'auth-error' : info ? 'auth-info' : undefined}>
        <div>
          <label htmlFor="auth-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 sm:text-sm"
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 sm:text-sm"
          />
        </div>
        {error && <p id="auth-error" role="alert" className="rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-700">{error}</p>}
        {info && <p id="auth-info" role="status" className="rounded-lg bg-jade-50 px-3 py-2 text-sm text-jade-700">{info}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 w-full cursor-pointer rounded-lg bg-jade-600 px-4 py-2 text-sm font-semibold text-white hover:bg-jade-700 disabled:opacity-50"
        >
          {submitting
            ? mode === 'signin'
              ? 'Signing in…'
              : 'Creating account…'
            : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError(null)
          setInfo(null)
        }}
        className="mt-5 min-h-11 cursor-pointer text-sm font-medium text-forest-700 hover:text-forest-900"
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
      </section>
    </div>
  )
}
