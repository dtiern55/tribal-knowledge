import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import { useAuth } from '../auth/useAuth'
import type {
  AdvantagePlay,
  AdvantageType,
  Contestant,
  Episode,
  RosterPick,
  Season,
} from '../types'

import { isEpisodeOpen } from '../lib/episodes'

export function AdvantagesPage() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [season, setSeason] = useState<Season | null>(null)
  const [types, setTypes] = useState<AdvantageType[]>([])
  const [balance, setBalance] = useState(0)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [roster, setRoster] = useState<RosterPick[]>([])
  const [nextOpen, setNextOpen] = useState<Episode | null>(null)
  const [ownPlays, setOwnPlays] = useState<AdvantagePlay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [rosterTarget, setRosterTarget] = useState('')
  const [voteTarget, setVoteTarget] = useState('')
  const [playing, setPlaying] = useState<string | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const active = await getActiveSeason()
        if (!active) return
        setSeason(active)

        const [advTypes, tokenBalance, cs, eps, rosterData, plays] = await Promise.all([
          api.get<AdvantageType[]>('/advantage-types'),
          api.get<{ balance: number }>(`/seasons/${active.id}/tokens/${userId}`),
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
          api.get<RosterPick[]>(`/seasons/${active.id}/roster/${userId}`).catch(() => []),
          api.get<AdvantagePlay[]>(`/seasons/${active.id}/advantage-plays/${userId}`),
        ])
        setTypes(advTypes)
        setBalance(tokenBalance.balance)
        setContestants(cs)
        setRoster(rosterData)
        setNextOpen(eps.find((ep) => isEpisodeOpen(ep, active)) ?? null)
        setOwnPlays(plays)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const alive = contestants.filter((c) => c.eliminated_in_episode == null)
  const activeRosterIds = new Set(
    roster.filter((r) => r.active_until_episode === null).map((r) => r.contestant_id),
  )
  const rosterOptions = alive.filter((c) => activeRosterIds.has(c.id))

  function alreadyPlayed(advantageType: string) {
    return (
      nextOpen != null &&
      ownPlays.some((p) => p.episode_id === nextOpen.id && p.advantage_type === advantageType)
    )
  }

  async function play(advantageType: string, targetContestantId?: string) {
    if (!season) return
    setPlaying(advantageType)
    setPlayError(null)
    try {
      const created = await api.post<AdvantagePlay>(`/seasons/${season.id}/advantage-plays`, {
        advantage_type: advantageType,
        target_contestant_id: targetContestantId ?? null,
      })
      setOwnPlays((prev) => [...prev, created])
      setBalance((prev) => prev - created.token_cost)
      setRosterTarget('')
      setVoteTarget('')
    } catch (e) {
      setPlayError(e instanceof Error ? e.message : 'Play failed')
    } finally {
      setPlaying(null)
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!season) return <p className="text-gray-500">No active season.</p>

  const byType = new Map(types.map((t) => [t.advantage_type, t]))
  const extraVote = byType.get('extra_vote')
  const doubleRoster = byType.get('double_roster_points')
  const doubleVote = byType.get('double_vote_points')

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{season.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Advantages</p>

      <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl mb-6">
        <span className="text-sm text-gray-500">Token balance</span>
        <span className="text-xl font-semibold text-gray-900">{balance}</span>
      </div>

      {!nextOpen && (
        <p className="text-sm text-gray-500 mb-6">
          No open episode right now — advantages can't be played until the next episode opens.
        </p>
      )}

      {playError && <p className="text-red-600 text-sm mb-4">{playError}</p>}

      <div className="space-y-4">
        {doubleRoster && (
          <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold text-gray-900">{doubleRoster.label}</p>
              <span className="text-xs text-gray-400">{doubleRoster.token_cost} tokens</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Double this episode's points from one contestant on your roster.
            </p>
            <div className="flex gap-2">
              <select
                value={rosterTarget}
                onChange={(e) => setRosterTarget(e.target.value)}
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select a roster contestant…</option>
                {rosterOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => play('double_roster_points', rosterTarget)}
                disabled={
                  !nextOpen ||
                  !rosterTarget ||
                  balance < doubleRoster.token_cost ||
                  alreadyPlayed('double_roster_points') ||
                  playing === 'double_roster_points'
                }
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
              >
                {playing === 'double_roster_points' ? 'Playing…' : 'Play'}
              </button>
            </div>
            {alreadyPlayed('double_roster_points') && (
              <p className="text-xs text-gray-400 mt-2">Already played for this episode.</p>
            )}
          </div>
        )}

        {doubleVote && (
          <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold text-gray-900">{doubleVote.label}</p>
              <span className="text-xs text-gray-400">{doubleVote.token_cost} tokens</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Double this episode's points from one elimination pick.
            </p>
            <div className="flex gap-2">
              <select
                value={voteTarget}
                onChange={(e) => setVoteTarget(e.target.value)}
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select a contestant…</option>
                {alive.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => play('double_vote_points', voteTarget)}
                disabled={
                  !nextOpen ||
                  !voteTarget ||
                  balance < doubleVote.token_cost ||
                  alreadyPlayed('double_vote_points') ||
                  playing === 'double_vote_points'
                }
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
              >
                {playing === 'double_vote_points' ? 'Playing…' : 'Play'}
              </button>
            </div>
            {alreadyPlayed('double_vote_points') && (
              <p className="text-xs text-gray-400 mt-2">Already played for this episode.</p>
            )}
          </div>
        )}

        {extraVote && (
          <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <div className="flex items-center justify-between mb-1">
              <p className="font-semibold text-gray-900">{extraVote.label}</p>
              <span className="text-xs text-gray-400">{extraVote.token_cost} tokens</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Make one additional elimination pick this episode.
            </p>
            <button
              onClick={() => play('extra_vote')}
              disabled={
                !nextOpen ||
                balance < extraVote.token_cost ||
                alreadyPlayed('extra_vote') ||
                playing === 'extra_vote'
              }
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
            >
              {playing === 'extra_vote' ? 'Playing…' : 'Play'}
            </button>
            {alreadyPlayed('extra_vote') && (
              <p className="text-xs text-gray-400 mt-2">Already played for this episode.</p>
            )}
          </div>
        )}
      </div>

      {ownPlays.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Your Plays
          </h2>
          <ul className="space-y-2">
            {[...ownPlays].reverse().map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm"
              >
                <span className="text-gray-700">
                  {byType.get(p.advantage_type)?.label ?? p.advantage_type}
                  {p.target_contestant_id && (
                    <span className="text-gray-400">
                      {' '}
                      → {contestantMap.get(p.target_contestant_id)?.name ?? '—'}
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-400">{p.token_cost} tokens</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
