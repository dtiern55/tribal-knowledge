import { useState } from 'react'
import { Navigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { AuthScene } from '../components/AuthScene'
import { PageLoader } from '../components/PageLoader'

export function LoginPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Set once we've emailed the user; swaps the form for the dedicated "check
  // your email" moment (#508). `kind` picks the copy: account confirmation
  // after sign-up vs. a password reset link.
  const [sent, setSent] = useState<{ kind: 'confirm' | 'reset'; email: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Don't flash the form while the session is still being restored (#1)
  if (loading) return <PageLoader label="Restoring your session…" />
  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

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
      setSent({ kind: 'confirm', email })
      setSubmitting(false)
    }
    // else: local dev / confirmation disabled — already signed in, the
    // redirect above handles it.
  }

  async function handleForgot() {
    setError(null)
    if (!email) {
      setError('Enter your email above, then tap “Forgot password?”.')
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent({ kind: 'reset', email })
  }

  if (sent) {
    return (
      <AuthScene>
        <div className="text-center">
          <h2 className="font-display text-2xl tracking-wide text-forest-800">Check your email</h2>
          <p role="status" className="mt-3 text-sm leading-6 text-gray-600">
            We sent {sent.kind === 'reset' ? 'a password reset link' : 'a confirmation link'} to{' '}
            <span className="font-semibold text-forest-700">{sent.email}</span>.{' '}
            {sent.kind === 'reset'
              ? 'Tap it to choose a new password.'
              : 'Tap it, then come back and sign in.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setSent(null)
              setMode('signin')
              setPassword('')
              setError(null)
            }}
            className="mt-6 min-h-11 w-full cursor-pointer rounded-lg bg-jade-600 px-4 py-2 text-sm font-semibold text-white hover:bg-jade-700"
          >
            Back to sign in
          </button>
        </div>
      </AuthScene>
    )
  }

  return (
    <AuthScene>
      <h2 className="font-display text-2xl tracking-wide text-forest-800">
        {mode === 'signin' ? 'Sign in' : 'Create your account'}
      </h2>
      {mode === 'signup' && (
        <p className="mt-1 text-sm text-gray-500">You’ll need your league’s join code after signing up.</p>
      )}
      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4" aria-describedby={error ? 'auth-error' : undefined}>
        <div>
          <label htmlFor="auth-email" className="mb-1 block text-sm font-medium text-gray-700">
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
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor="auth-password" className="text-sm font-medium text-gray-700">
              Password
            </label>
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => void handleForgot()}
                disabled={submitting}
                className="cursor-pointer text-xs font-medium text-forest-700 hover:text-forest-900 disabled:opacity-50"
              >
                Forgot password?
              </button>
            )}
          </div>
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
        }}
        className="mt-5 min-h-11 w-full cursor-pointer text-sm font-medium text-forest-700 hover:text-forest-900"
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </AuthScene>
  )
}
