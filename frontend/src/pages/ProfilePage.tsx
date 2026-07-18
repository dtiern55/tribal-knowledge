import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import {
  installAvailable,
  isInstalled,
  isIos,
  onInstallAvailable,
  promptInstall,
} from '../lib/install'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'
import type { UserProfile } from '../types'

const inputCls =
  'w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500'
const buttonCls =
  'w-full bg-ocean-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-ocean-700 disabled:opacity-50 cursor-pointer'

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
      await api.patch<UserProfile>('/me', { display_name: displayName })
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Display name
        </label>
        <input
          value={displayName}
          onChange={(e) => {
            setDisplayName(e.target.value)
            setSaved(false)
          }}
          required
          maxLength={100}
          className={inputCls}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-600">Saved.</p>}
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Currently <span className="font-medium">{currentEmail}</span>
        </p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="new@email.com"
          required
          className={inputCls}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Current password
        </label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          autoComplete="current-password"
          className={inputCls}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-green-600">{info}</p>}
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      {info && <p className="text-sm text-green-600">{info}</p>}
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

  if (isInstalled()) return null

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-1">
        Add to home screen
      </p>
      {canPrompt ? (
        <>
          <p className="text-xs text-gray-500 mb-3">
            Install Tribal Knowledge as an app — fullscreen, with its own icon.
          </p>
          <button onClick={() => void promptInstall()} className={buttonCls}>
            Install app
          </button>
        </>
      ) : isIos() ? (
        <p className="text-xs text-gray-500">
          In Safari, tap <span className="font-medium">Share</span> →{' '}
          <span className="font-medium">Add to Home Screen</span> to install
          Tribal Knowledge as an app.
        </p>
      ) : (
        <p className="text-xs text-gray-500">
          Open this site in your phone's browser to install it as an app (look
          for "Add to Home Screen" or "Install" in the browser menu).
        </p>
      )}
    </div>
  )
}

export function ProfilePage() {
  return (
    <div className="max-w-sm mx-auto mt-8 space-y-8">
      <h1 className="text-2xl font-semibold text-gray-900">Profile</h1>
      <DisplayNameSection />
      <div className="border-t border-gray-200 pt-6">
        <EmailSection />
      </div>
      <div className="border-t border-gray-200 pt-6">
        <PasswordSection />
      </div>
      <div className="border-t border-gray-200 pt-6">
        <InstallSection />
      </div>
    </div>
  )
}
