import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import { useAuth } from '../auth/useAuth'
import type { Contestant, Episode, Season, WinnerPick } from '../types'

export function WinnerPickPage() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [season, setSeason] = useState<Season | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [pick, setPick] = useState<WinnerPick | null>(null)
  const [hasPick, setHasPick] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [winner, setWinner] = useState('')
  const [backup, setBackup] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

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
        setEpisodes(eps)

        try {
          const p = await api.get<WinnerPick>(`/seasons/${active.id}/winner-picks/${userId}`)
          setPick(p)
          setHasPick(true)
        } catch {
          setHasPick(false)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  const mergeEpisode =
    season?.merge_episode != null
      ? episodes.find((e) => e.episode_number === season.merge_episode)
      : undefined
  const windowOpen =
    mergeEpisode != null
      ? mergeEpisode.status !== 'scored' && new Date(mergeEpisode.picks_lock_at) > new Date()
      : false

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const alive = contestants.filter((c) => c.eliminated_in_episode == null)

  async function submitPick() {
    if (!season || !winner || !backup) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const p = await api.post<WinnerPick>(`/seasons/${season.id}/winner-picks`, {
        winner_contestant_id: winner,
        backup_contestant_id: backup,
      })
      setPick(p)
      setHasPick(true)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!season) return <p className="text-gray-500">No active season.</p>

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{season.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Winner Pick</p>

      {hasPick && pick ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Your pick is locked in. Changes require tokens (coming soon).
          </p>
          <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Winner
              </span>
              <span className="font-medium text-gray-900">
                {contestantMap.get(pick.winner_contestant_id)?.name ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Backup
              </span>
              <span className="font-medium text-gray-900">
                {contestantMap.get(pick.backup_contestant_id)?.name ?? '—'}
              </span>
            </div>
          </div>
        </div>
      ) : windowOpen ? (
        <div>
          <p className="text-sm text-gray-600 mb-1">
            Pick your winner and a backup before the merge lock.
          </p>
          <p className="text-xs text-gray-400 mb-6">
            Locked before episode {season.merge_episode} · changes after lock cost tokens
          </p>
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Winner
              </label>
              <select
                value={winner}
                onChange={(e) => {
                  setWinner(e.target.value)
                  if (backup === e.target.value) setBackup('')
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select a winner…</option>
                {alive.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id === backup}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Backup
              </label>
              <select
                value={backup}
                onChange={(e) => setBackup(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select a backup…</option>
                {alive.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.id === winner}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {submitError && <p className="text-red-600 text-sm mb-4">{submitError}</p>}
          <button
            onClick={submitPick}
            disabled={!winner || !backup || submitting}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Lock In Pick'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          {season.merge_episode
            ? 'Winner pick window has closed.'
            : 'Winner pick window has not opened yet.'}
        </p>
      )}
    </div>
  )
}
