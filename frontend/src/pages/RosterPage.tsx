import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import { useAuth } from '../auth/useAuth'
import type { Contestant, Episode, RosterPick, Season } from '../types'

export function RosterPage() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [season, setSeason] = useState<Season | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [roster, setRoster] = useState<RosterPick[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [swapOld, setSwapOld] = useState('')
  const [swapNew, setSwapNew] = useState('')
  const [swapEpisode, setSwapEpisode] = useState('')
  const [swapping, setSwapping] = useState(false)
  const [swapError, setSwapError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const active = await getActiveSeason()
        if (!active) return
        setSeason(active)

        const [cs, eps, rosterData] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
          api.get<RosterPick[]>(`/seasons/${active.id}/roster/${userId}`),
        ])
        setContestants(cs)
        setEpisodes(eps)
        setRoster(rosterData)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  const lockEpisode =
    season?.roster_lock_episode != null
      ? episodes.find((e) => e.episode_number === season.roster_lock_episode)
      : undefined
  // Matches the backend: open until the lock episode exists and has locked
  const windowOpen =
    season?.roster_lock_episode != null &&
    season.status !== 'completed' &&
    (lockEpisode == null ||
      (lockEpisode.status !== 'scored' && new Date(lockEpisode.picks_lock_at) > new Date()))

  const hasRoster = roster.length > 0
  const activeRoster = roster.filter((r) => r.active_until_episode === null)
  const swappedRoster = roster.filter((r) => r.active_until_episode !== null)
  const contestantMap = new Map(contestants.map((c) => [c.id, c]))

  const upcomingEpisodes = episodes.filter(
    (e) => e.status !== 'scored' && new Date(e.picks_lock_at) > new Date(),
  )
  const rosterContestantIds = new Set(roster.map((r) => r.contestant_id))
  const swapCandidates = contestants.filter(
    (c) => !rosterContestantIds.has(c.id) && c.eliminated_in_episode == null,
  )

  function toggleSelect(id: string) {
    if (!season) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < season.roster_size) {
        next.add(id)
      }
      return next
    })
  }

  async function submitRoster() {
    if (!season) return
    setSubmitting(true)
    setError(null)
    try {
      const picks = await api.post<RosterPick[]>(`/seasons/${season.id}/roster`, {
        contestant_ids: [...selected],
      })
      setRoster(picks)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitSwap() {
    if (!season || !swapOld || !swapNew || !swapEpisode || !userId) return
    setSwapping(true)
    setSwapError(null)
    try {
      await api.post<RosterPick>(`/seasons/${season.id}/roster/swap`, {
        old_contestant_id: swapOld,
        new_contestant_id: swapNew,
        episode_id: swapEpisode,
      })
      const updated = await api.get<RosterPick[]>(`/seasons/${season.id}/roster/${userId}`)
      setRoster(updated)
      setSwapOld('')
      setSwapNew('')
      setSwapEpisode('')
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : 'Swap failed')
    } finally {
      setSwapping(false)
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error && !season) return <p className="text-red-600">{error}</p>
  if (!season) return <p className="text-gray-500">No active season.</p>

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{season.name}</h1>
      <p className="text-sm text-gray-500 mb-6">My Roster</p>

      {hasRoster ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
              Active
            </h2>
            <ul className="space-y-2">
              {activeRoster.map((pick) => {
                const c = contestantMap.get(pick.contestant_id)
                return (
                  <li
                    key={pick.id}
                    className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                  >
                    <span className="font-medium text-gray-900">{c?.name ?? '—'}</span>
                    <span className="text-xs text-gray-400">from ep {pick.active_from_episode}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          {swappedRoster.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
                Swapped Out
              </h2>
              <ul className="space-y-2">
                {swappedRoster.map((pick) => {
                  const c = contestantMap.get(pick.contestant_id)
                  return (
                    <li
                      key={pick.id}
                      className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg text-gray-400"
                    >
                      <span className="line-through">{c?.name ?? '—'}</span>
                      <span className="text-xs">
                        ep {pick.active_from_episode}–{pick.active_until_episode}
                        {pick.swap_penalty_points !== 0 && (
                          <span className="ml-2 text-red-400">{pick.swap_penalty_points} pts</span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {season.status !== 'completed' &&
            upcomingEpisodes.length > 0 &&
            swapCandidates.length > 0 && (
              <div className="pt-4 border-t border-gray-100">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                  Swap a Pick ({season.swap_penalty_points} pts penalty)
                </h2>
                <div className="space-y-3">
                  <div className="flex gap-3 flex-wrap">
                    <select
                      value={swapOld}
                      onChange={(e) => setSwapOld(e.target.value)}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Drop contestant…</option>
                      {activeRoster.map((pick) => {
                        const c = contestantMap.get(pick.contestant_id)
                        return (
                          <option key={pick.id} value={pick.contestant_id}>
                            {c?.name ?? pick.contestant_id}
                          </option>
                        )
                      })}
                    </select>
                    <select
                      value={swapNew}
                      onChange={(e) => setSwapNew(e.target.value)}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Add contestant…</option>
                      {swapCandidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={swapEpisode}
                      onChange={(e) => setSwapEpisode(e.target.value)}
                      className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Episode…</option>
                      {upcomingEpisodes.map((e) => (
                        <option key={e.id} value={e.id}>
                          Ep {e.episode_number}
                        </option>
                      ))}
                    </select>
                  </div>
                  {swapError && <p className="text-red-600 text-sm">{swapError}</p>}
                  <button
                    onClick={submitSwap}
                    disabled={!swapOld || !swapNew || !swapEpisode || swapping}
                    className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-gray-900 transition-colors"
                  >
                    {swapping ? 'Swapping…' : 'Confirm Swap'}
                  </button>
                </div>
              </div>
            )}
        </div>
      ) : windowOpen ? (
        <div>
          <p className="text-sm text-gray-600 mb-1">
            Pick {season.roster_size} castaways for your season roster.
          </p>
          <p className="text-xs text-gray-400 mb-6">
            Lock-in before episode {season.roster_lock_episode} · {selected.size} /{' '}
            {season.roster_size} selected
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {contestants.map((c) => {
              const isSelected = selected.has(c.id)
              const maxed = !isSelected && selected.size >= season.roster_size
              return (
                <button
                  key={c.id}
                  onClick={() => toggleSelect(c.id)}
                  disabled={maxed}
                  className={[
                    'p-3 rounded-lg border text-left text-sm font-medium transition-colors',
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                      : maxed
                        ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                  ].join(' ')}
                >
                  {c.name}
                </button>
              )
            })}
          </div>
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          <button
            onClick={submitRoster}
            disabled={selected.size !== season.roster_size || submitting}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
          >
            {submitting ? 'Submitting…' : 'Lock In Roster'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Roster submission window has closed.</p>
      )}
    </div>
  )
}
