import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import { ContestantAvatar } from '../components/ContestantAvatar'
import { isEpisodeOpen } from '../lib/episodes'
import { formatCentral } from '../lib/time'
import { useAuth } from '../auth/useAuth'
import type { AdvantagePlay, Contestant, EliminationPick, Episode, Season } from '../types'

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
  const [plays, setPlays] = useState<AdvantagePlay[]>([])
  const [doubleTarget, setDoubleTarget] = useState('')
  const [advBusy, setAdvBusy] = useState(false)
  const [advError, setAdvError] = useState<string | null>(null)
  // Saved picks show as a locked-in confirmation until the user asks to edit
  const [editing, setEditing] = useState(false)

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

        const [cs, eps, ownPlays] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
          api.get<AdvantagePlay[]>(`/seasons/${active.id}/advantage-plays/${userId}`),
        ])
        setContestants(cs)
        setEpisodes(eps)
        setPlays(ownPlays)

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
          if (isEpisodeOpen(ep, active)) {
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
    return season != null && isEpisodeOpen(ep, season)
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

  function replacePlay(updated: AdvantagePlay) {
    setPlays((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  async function applyPlay(play: AdvantagePlay, targetContestantId?: string) {
    setAdvBusy(true)
    setAdvError(null)
    try {
      replacePlay(
        await api.post<AdvantagePlay>(`/advantage-plays/${play.id}/use`, {
          target_contestant_id: targetContestantId ?? null,
        }),
      )
      setDoubleTarget('')
    } catch (e) {
      setAdvError(e instanceof Error ? e.message : 'Advantage failed')
    } finally {
      setAdvBusy(false)
    }
  }

  function cancelEdit(episodeId: string) {
    const saved = picksByEpisode.get(episodeId) ?? []
    setPending((prev) =>
      new Map(prev).set(episodeId, new Set(saved.map((p) => p.contestant_id))),
    )
    setEditing(false)
  }

  async function takeBackPlay(play: AdvantagePlay) {
    setAdvBusy(true)
    setAdvError(null)
    try {
      replacePlay(await api.delete<AdvantagePlay>(`/advantage-plays/${play.id}/use`))
    } catch (e) {
      setAdvError(e instanceof Error ? e.message : 'Take back failed')
    } finally {
      setAdvBusy(false)
    }
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
      setEditing(false)
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
        const savedPicks = picksByEpisode.get(ep.id) ?? []
        const hasSavedPicks = savedPicks.length > 0
        const confirmed = hasSavedPicks && !editing

        const ownedExtra = plays.find(
          (p) => p.episode_id === null && p.advantage_type === 'extra_vote',
        )
        const activeExtra = plays.find(
          (p) => p.episode_id === ep.id && p.advantage_type === 'extra_vote',
        )
        const ownedDouble = plays.find(
          (p) => p.episode_id === null && p.advantage_type === 'double_vote_points',
        )
        const activeDouble = plays.find(
          (p) => p.episode_id === ep.id && p.advantage_type === 'double_vote_points',
        )
        const maxPicks = ep.max_elimination_picks + (activeExtra ? 1 : 0)

        return (
          <div key={ep.id} className="mb-8 p-4 bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-900">Episode {ep.episode_number}</h2>
              <span className="text-xs text-gray-400">
                Locks {formatCentral(ep.picks_lock_at)}
              </span>
            </div>
            {confirmed ? (
              <div className="mb-4 p-5 bg-green-50 border-2 border-green-500 rounded-xl text-center">
                <p className="text-3xl mb-1">🔥</p>
                <p className="font-semibold text-green-800 mb-3">
                  Picks locked in for Episode {ep.episode_number}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {savedPicks.map((p) => (
                    <span
                      key={p.id}
                      className="text-sm px-3 py-1.5 bg-white border border-green-200 rounded-lg font-medium text-gray-800"
                    >
                      {contestantMap.get(p.contestant_id)?.name ?? '—'}
                      {activeDouble?.target_contestant_id === p.contestant_id && (
                        <span className="text-indigo-600 font-semibold"> ×2</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-4">
                  Pick up to {maxPicks} to be eliminated · {epPending.size} /{' '}
                  {maxPicks} selected
                  {activeExtra && ' · Extra Vote active'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {contestants.map((c) => {
                    const isOut = c.eliminated_in_episode != null
                    const isSelected = epPending.has(c.id)
                    const isDoubled = activeDouble?.target_contestant_id === c.id
                    const maxed = !isSelected && epPending.size >= maxPicks
                    return (
                      <button
                        key={c.id}
                        onClick={() => togglePick(ep.id, c.id, maxPicks)}
                        disabled={maxed || isOut}
                        className={[
                          'flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm font-medium transition-colors',
                          isOut
                            ? 'border-gray-100 bg-gray-50 text-gray-300 line-through cursor-not-allowed'
                            : isSelected
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                              : maxed
                                ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300',
                        ].join(' ')}
                      >
                        <ContestantAvatar name={c.name} imageUrl={c.image_url} size="sm" />
                        {c.name}
                        {isDoubled && <span className="text-indigo-600 font-semibold"> ×2</span>}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {(ownedExtra || activeExtra || ownedDouble || activeDouble) && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Advantages
                </p>
                {activeExtra ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">Extra Vote active — +1 pick this episode</span>
                    <button
                      onClick={() => void takeBackPlay(activeExtra)}
                      disabled={advBusy}
                      className="text-xs text-amber-700 hover:text-amber-900 font-medium"
                    >
                      Take back
                    </button>
                  </div>
                ) : (
                  ownedExtra && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">You own an Extra Vote</span>
                      <button
                        onClick={() => void applyPlay(ownedExtra)}
                        disabled={advBusy}
                        className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-lg disabled:opacity-40 hover:bg-amber-700 transition-colors"
                      >
                        Play it (+1 pick)
                      </button>
                    </div>
                  )
                )}
                {activeDouble ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">
                      Double Vote Points on{' '}
                      <span className="font-medium">
                        {contestantMap.get(activeDouble.target_contestant_id ?? '')?.name ?? '—'}
                      </span>
                    </span>
                    <button
                      onClick={() => void takeBackPlay(activeDouble)}
                      disabled={advBusy}
                      className="text-xs text-amber-700 hover:text-amber-900 font-medium"
                    >
                      Take back
                    </button>
                  </div>
                ) : (
                  ownedDouble &&
                  (epPending.size > 0 ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-700 shrink-0">Double a pick:</span>
                      <select
                        value={doubleTarget}
                        onChange={(e) => setDoubleTarget(e.target.value)}
                        className="flex-1 min-w-0 border border-amber-200 rounded-lg px-2 py-1 text-sm bg-white"
                      >
                        <option value="">Choose…</option>
                        {[...epPending].map((cid) => (
                          <option key={cid} value={cid}>
                            {contestantMap.get(cid)?.name ?? '—'}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => void applyPlay(ownedDouble, doubleTarget)}
                        disabled={advBusy || !doubleTarget}
                        className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-lg disabled:opacity-40 hover:bg-amber-700 transition-colors"
                      >
                        Double ×2
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      You own Double Vote Points — select picks first, then double one.
                    </p>
                  ))
                )}
                {advError && <p className="text-red-600 text-xs">{advError}</p>}
              </div>
            )}

            {episodeError && <p className="text-red-600 text-sm mb-3">{episodeError}</p>}
            {confirmed ? (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:border-gray-400 transition-colors"
                >
                  Edit Picks
                </button>
                <span className="text-xs text-gray-400">
                  Editable until {formatCentral(ep.picks_lock_at)}
                </span>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => submitPicks(ep.id)}
                  disabled={submitting === ep.id || epPending.size === 0}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
                >
                  {submitting === ep.id ? 'Locking in…' : '🔥 Lock In Picks'}
                </button>
                {hasSavedPicks && (
                  <button
                    onClick={() => cancelEdit(ep.id)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:border-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
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
