import { useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../auth/useAuth'
import type { UserProfile } from '../types'

export function ProfilePage() {
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
    <div className="max-w-sm mx-auto mt-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Profile</h1>
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
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ocean-500"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-green-600">Saved.</p>}
        <button
          type="submit"
          disabled={saving || unchanged || !displayName.trim()}
          className="w-full bg-ocean-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-ocean-700 disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
