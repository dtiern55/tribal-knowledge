import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import { formatCentral } from '../lib/time'
import { useAuth } from '../auth/useAuth'
import type { Contestant, EliminationPick, Episode, Season } from '../types'

export function PicksPage() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [season, setSeason] = useState<Season | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [picksByEpisode, setPicksByEpisode] = useState<Map<string, EliminationPick[]>>(new Map())
  const [pending, setPending] = useState<Map<string, Set<string>>>(new Map())
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const active = await getActiveSeason()
        if (!active) {
          setLoading(false)
          return
        }
        setSeason(active)

        const [cs, eps] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
        ])
        setContestants(cs)
        setEpisodes(eps)

        const results = await Promise.all(
          eps.map((ep) =>
            api
              .get<EliminationPick[]>(`/episodes/${ep.id}/picks/${userId}`)
              .then((picks): [string, EliminationPick[]] => [ep.id, picks])
              .catch((): [string, EliminationPick[]] => [ep.id, []]),
          ),
        )
        const picksMap = new Map(results)
        setPicksByEpisode(picksMap)

        // Pre-fill pending picks from any already-saved picks on open episodes
        const pendingMap = new Map<string, Set<string>>()
        for (const ep of eps) {
          if (ep.status !== 'scored' && new Date(ep.picks_lock_at) > new Date()) {
            const saved = picksMap.get(ep.id) ?? []
            pendingMap.set(ep.id, new Set(saved.map((p) => p.contestant_id)))
          }
        }
        setPending(pendingMap)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))

  function isOpen(ep: Episode) {
    return ep.status !== 'scored' && new Date(ep.picks_lock_at) > new Date()
  }

  function togglePick(episodeId: string, contestantId: string, maxPicks: number) {
    setPending((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(episodeId) ?? [])
      if (set.has(contestantId)) {
        set.delete(contestantId)
      } else if (set.size < maxPicks) {
        set.add(contestantId)
      }
      next.set(episodeId, set)
      return next
    })
  }

  async function submitPicks(episodeId: string) {
    setSubmitting(episodeId)
    setErrors((prev) => {
      const m = new Map(prev)
      m.delete(episodeId)
      return m
    })
    try {
      const picks = await api.post<EliminationPick[]>(`/episodes/${episodeId}/picks`, {
        contestant_ids: [...(pending.get(episodeId) ?? [])],
      })
      setPicksByEpisode((prev) => {
        const m = new Map(prev)
        m.set(episodeId, picks)
        return m
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Submit failed'
      setErrors((prev) => {
        const m = new Map(prev)
        m.set(episodeId, msg)
        return m
      })
    } finally {
      setSubmitting(null)
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!season) return <p className="text-gray-500">No active season.</p>

  // Week-by-week: only the next unlocked episode accepts picks
  const nextOpen = episodes.find(isOpen)
  const closedEpisodes = episodes.filter((ep) => !isOpen(ep)).reverse()

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{season.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Elimination Picks</p>

      {!nextOpen && closedEpisodes.length === 0 && (
        <p className="text-gray-500 text-sm">No episodes yet.</p>
      )}

      {nextOpen && (() => {
        const ep = nextOpen
        const epPending = pending.get(ep.id) ?? new Set<string>()
        const episodeError = errors.get(ep.id)
        const hasSavedPicks = (picksByEpisode.get(ep.id) ?? []).length > 0

        return (
          <div key={ep.id} className="mb-8 p-4 bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-900">Episode {ep.episode_number}</h2>
              <span className="text-xs text-gray-400">
                Locks {formatCentral(ep.picks_lock_at)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Pick up to {ep.max_elimination_picks} to be eliminated · {epPending.size} /{' '}
              {ep.max_elimination_picks} selected
              {hasSavedPicks && ' · picks saved'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {contestants.map((c) => {
                const isOut = c.eliminated_in_episode != null
                const isSelected = epPending.has(c.id)
                const maxed = !isSelected && epPending.size >= ep.max_elimination_picks
                return (
                  <button
                    key={c.id}
                    onClick={() => togglePick(ep.id, c.id, ep.max_elimination_picks)}
                    disabled={maxed || isOut}
                    className={[
                      'p-2.5 rounded-lg border text-left text-sm font-medium transition-colors',
                      isOut
                        ? 'border-gray-100 bg-gray-50 text-gray-300 line-through cursor-not-allowed'
                        : isSelected
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
            {episodeError && <p className="text-red-600 text-sm mb-3">{episodeError}</p>}
            <button
              onClick={() => submitPicks(ep.id)}
              disabled={submitting === ep.id}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
            >
              {submitting === ep.id ? 'Saving…' : hasSavedPicks ? 'Update Picks' : 'Save Picks'}
            </button>
          </div>
        )
      })()}

      {closedEpisodes.length > 0 && (
        <div>
          {nextOpen && (
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-4">
              Past Episodes
            </h2>
          )}
          <div className="space-y-3">
            {closedEpisodes.map((ep) => {
              const picks = picksByEpisode.get(ep.id) ?? []
              return (
                <div key={ep.id} className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-700">Episode {ep.episode_number}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        ep.status === 'scored'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {ep.status}
                    </span>
                  </div>
                  {picks.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {picks.map((p) => (
                        <span
                          key={p.id}
                          className="text-sm px-2 py-1 bg-white border border-gray-200 rounded-md text-gray-700"
                        >
                          {contestantMap.get(p.contestant_id)?.name ?? '—'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No picks submitted</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
