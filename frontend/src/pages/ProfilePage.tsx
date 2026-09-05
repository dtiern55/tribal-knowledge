import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import {
  installAvailable,
  isAndroid,
  isInstalled,
  isIos,
  onInstallAvailable,
  promptInstall,
} from '../lib/install'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'
import type { UserProfile } from '../types'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { InstallSteps } from '../components/InstallSteps'

const inputCls =
  'min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-forest-500 sm:text-sm'
const buttonCls =
  'min-h-11 w-full cursor-pointer rounded-lg bg-jade-600 px-4 py-2 text-sm font-semibold text-white hover:bg-jade-700 disabled:opacity-50'

function DisplayNameSection() {
  const { profile, refreshProfile } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const unchanged = displayName.trim() === profile?.display_name

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.patch<UserProfile>('/me', { display_name: displayName.trim() })
      await refreshProfile()
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label htmlFor="profile-display-name" className="block text-sm font-medium text-gray-700 mb-1">
          Display name
        </label>
        <input
          id="profile-display-name"
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value)
            setSaved(false)
          }}
          required
          maxLength={40}
          autoComplete="name"
          className={inputCls}
        />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {saved && <Notice tone="success">League profile saved.</Notice>}
      <button
        type="submit"
        disabled={saving || unchanged || !displayName.trim()}
        className={buttonCls}
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

/** Prove the caller knows the current password before an account change
 * (#139) — an unlocked phone alone must not be enough to take over. */
async function verifyCurrentPassword(
  email: string,
  password: string,
): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? 'Current password is incorrect' : null
}

function EmailSection() {
  const { session } = useAuth()
  const currentEmail = session?.user.email ?? ''
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setInfo(null)
    const authError = await verifyCurrentPassword(currentEmail, currentPassword)
    if (authError) {
      setError(authError)
      setSaving(false)
      return
    }
    const { data, error } = await supabase.auth.updateUser({ email })
    if (error) {
      setError(error.message)
    } else if (data.user.new_email) {
      // Email confirmation enabled: change is pending until verified.
      setInfo(`Check ${email} for a confirmation link to finish the change.`)
    } else {
      setInfo('Email updated.')
      setEmail('')
    }
    setCurrentPassword('')
    setSaving(false)
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label htmlFor="profile-new-email" className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Currently <span className="font-medium">{currentEmail}</span>
        </p>
        <input
          id="profile-new-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="new@email.com"
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          className={inputCls}
        />
      </div>
      <div>
        <label htmlFor="email-current-password" className="block text-sm font-medium text-gray-700 mb-1">
          Current password
        </label>
        <input
          id="email-current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
          className={inputCls}
        />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {info && <Notice tone="success">{info}</Notice>}
      <button
        type="submit"
        disabled={
          saving ||
          !email.trim() ||
          !currentPassword ||
          email.trim() === currentEmail
        }
        className={buttonCls}
      >
        {saving ? 'Saving…' : 'Change email'}
      </button>
    </form>
  )
}

function PasswordSection() {
  const { session } = useAuth()
  const currentEmail = session?.user.email ?? ''
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSaving(true)
    setError(null)
    setInfo(null)
    const authError = await verifyCurrentPassword(currentEmail, current)
    if (authError) {
      setError(authError)
      setSaving(false)
      return
    }
    // GoTrue's "require current password" setting validates this
    // server-side; supabase-js's type doesn't know the field, hence the cast.
    const { error } = await supabase.auth.updateUser({
      password,
      current_password: current,
    } as unknown as { password: string })
    if (error) {
      setError(error.message)
    } else {
      // Changing the password should actually lock out anyone else who
      // holds a session (#139); this device keeps its own.
      await supabase.auth.signOut({ scope: 'others' })
      setInfo('Password updated. Any other signed-in devices were logged out.')
      setCurrent('')
      setPassword('')
      setConfirm('')
    }
    setSaving(false)
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Current password
        </label>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          autoComplete="current-password"
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          New password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Confirm new password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          className={inputCls}
        />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {info && <Notice tone="success">{info}</Notice>}
      <button
        type="submit"
        disabled={saving || !current || !password || !confirm}
        className={buttonCls}
      >
        {saving ? 'Saving…' : 'Change password'}
      </button>
    </form>
  )
}

function InstallSection() {
  const [canPrompt, setCanPrompt] = useState(installAvailable())
  useEffect(() => onInstallAvailable(() => setCanPrompt(true)), [])

  // Only show when there's an actionable path: a live install prompt, or a
  // phone where we can give manual steps. Otherwise the section (and its
  // instructions) stays hidden rather than lingering as stale, button-less
  // text on desktop (#223).
  if (isInstalled() || (!canPrompt && !isIos() && !isAndroid())) return null

  return (
    <section aria-labelledby="install-app-title" className="rounded-2xl border border-cream-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 id="install-app-title" className="text-sm font-medium text-gray-700 mb-1">
        Add to home screen
      </h2>
      {canPrompt ? (
        <>
          <p className="text-xs text-gray-500 mb-3">
            Install Snakes and Rats as an app — fullscreen, with its own icon.
          </p>
          <button onClick={() => void promptInstall()} className={buttonCls}>
            Install app
          </button>
        </>
      ) : (
        <p className="text-xs text-gray-500">
          <InstallSteps />
        </p>
      )}
    </section>
  )
}

/** Collapsed row that expands into its section on click (#238). */
function Collapsible({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-sm font-medium text-gray-700 hover:text-gray-900"
      >
        {label}
        <svg
          viewBox="0 0 24 24"
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  )
}

export function ProfilePage() {
  const { session, profile } = useAuth()
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Identity and security"
        title="Profile"
        description="Keep your league name distinct from the account you use to sign in."
      />

      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <section aria-labelledby="league-profile-title" className="rounded-2xl border border-cream-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="league-profile-title" className="font-display text-xl tracking-wide text-forest-800">League profile</h2>
          <p className="mt-1 mb-5 text-sm text-gray-500">This is how other players see you in standings and team views.</p>
          <DisplayNameSection />
          {profile?.is_admin && <p className="mt-4 text-xs font-semibold text-terracotta-700">League commissioner</p>}
        </section>

        <section aria-labelledby="account-identity-title" className="rounded-2xl border border-cream-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="account-identity-title" className="font-display text-xl tracking-wide text-forest-800">Account identity</h2>
          <p className="mt-1 text-sm text-gray-500">Used only for signing in and account recovery.</p>
          <p className="mt-3 break-all text-sm font-medium text-gray-800">{session?.user.email ?? 'Email unavailable'}</p>
          <div className="mt-6 border-t border-cream-200 pt-5">
            <Collapsible label="Change email">
              <EmailSection />
            </Collapsible>
          </div>
          <div className="mt-5 border-t border-cream-200 pt-5">
            <Collapsible label="Change password">
              <PasswordSection />
            </Collapsible>
          </div>
        </section>
      </div>

      <InstallSection />
    </div>
  )
}
