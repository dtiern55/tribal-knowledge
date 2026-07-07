import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import { formatCentral } from '../lib/time'
import { useAuth } from '../auth/useAuth'
import type { Contestant, Episode, Season, WinnerPick } from '../types'

export function WinnerPickPage() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [season, setSeason] = useState<Season | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [lockEpisode, setLockEpisode] = useState<Episode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [winner, setWinner] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const active = await getActiveSeason()
        if (!active) return
        setSeason(active)

        const [cs, eps] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
        ])
        setContestants(cs)
        const lockEp =
          active.winner_lock_episode != null
            ? (eps.find((e) => e.episode_number === active.winner_lock_episode) ?? null)
            : null
        setLockEpisode(lockEp)

        try {
          const p = await api.get<WinnerPick>(`/seasons/${active.id}/winner-picks/${userId}`)
          setWinner(p.winner_contestant_id)
        } catch {
          // No pick yet — form starts empty
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  // Matches roster/#40: open until the lock episode exists and locks
  const windowOpen =
    season?.winner_lock_episode != null &&
    season.status !== 'completed' &&
    (lockEpisode == null ||
      (lockEpisode.status !== 'scored' && new Date(lockEpisode.picks_lock_at) > new Date()))

  const alive = contestants.filter((c) => c.eliminated_in_episode == null)

  async function submitPick() {
    if (!season || !winner) return
    setSubmitting(true)
    setSubmitError(null)
    setSaved(false)
    try {
      await api.post<WinnerPick>(`/seasons/${season.id}/winner-picks`, {
        winner_contestant_id: winner,
      })
      setSaved(true)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!season) return <p className="text-gray-500">No active season.</p>

  if (!windowOpen) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">{season.name}</h1>
        <p className="text-sm text-gray-500 mb-6">Winner Pick</p>
        <p className="text-sm text-gray-500">
          {season.winner_lock_episode
            ? 'Winner pick window has closed.'
            : 'Winner pick window has not opened yet.'}
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{season.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Winner Pick</p>
      <p className="text-sm text-gray-600 mb-1">Pick who you think will win the season.</p>
      <p className="text-xs text-gray-400 mb-6">
        Locks before episode {season.winner_lock_episode}
        {lockEpisode && <> ({formatCentral(lockEpisode.picks_lock_at)})</>} · you can change
        your pick until then
      </p>

      <div className="mb-6">
        <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
          Winner
        </label>
        <select
          value={winner}
          onChange={(e) => {
            setWinner(e.target.value)
            setSaved(false)
          }}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Select a winner…</option>
          {alive.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {submitError && <p className="text-red-600 text-sm mb-4">{submitError}</p>}
      {saved && <p className="text-green-600 text-sm mb-4">Pick saved.</p>}

      <button
        onClick={submitPick}
        disabled={!winner || submitting}
        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
      >
        {submitting ? 'Saving…' : 'Save Pick'}
      </button>
    </div>
  )
}
