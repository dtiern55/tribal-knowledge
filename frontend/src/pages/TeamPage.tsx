import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../lib/api'
import { ContestantAvatar } from '../components/ContestantAvatar'
import type { Contestant, RosterPick, StandingEntry } from '../types'

// Read-only view of another player's roster, reached from Standings (#83).
// The roster endpoint 403s until rosters lock, so hidden teams show a note.
export function TeamPage() {
  const { seasonId, userId } = useParams()
  const navigate = useNavigate()
  const [roster, setRoster] = useState<RosterPick[]>([])
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [name, setName] = useState<string>('')
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!seasonId || !userId) return
    async function load() {
      try {
        const [cs, standings] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${seasonId}/contestants`),
          api.get<StandingEntry[]>(`/seasons/${seasonId}/standings`),
        ])
        setContestants(cs)
        setName(standings.find((s) => s.user_id === userId)?.display_name ?? 'Team')
        try {
          setRoster(await api.get<RosterPick[]>(`/seasons/${seasonId}/roster/${userId}`))
        } catch {
          setHidden(true) // 403 until rosters lock
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load team')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [seasonId, userId])

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const active = roster.filter((r) => r.active_until_episode === null)

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-ocean-600 hover:text-ocean-800"
      >
        ← Back
      </button>
      <h1 className="text-2xl font-semibold text-gray-900 mt-3 mb-1">{name}</h1>
      <p className="text-sm text-gray-500 mb-6">Roster</p>

      {hidden ? (
        <p className="text-sm text-gray-500">This team is hidden until rosters lock.</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-gray-500">No roster yet.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((pick) => {
            const c = contestantMap.get(pick.contestant_id)
            return (
              <li
                key={pick.id}
                className="flex items-center p-3 bg-white border border-gray-200 rounded-lg"
              >
                <Link
                  to={`/contestants/${pick.contestant_id}`}
                  className="flex items-center gap-2 font-medium text-gray-900 hover:text-ocean-700"
                >
                  <ContestantAvatar name={c?.name ?? '—'} imageUrl={c?.image_url ?? null} />
                  {c?.name ?? '—'}
                  {c?.eliminated_in_episode != null && (
                    <span className="text-[10px] uppercase tracking-wide bg-red-50 text-red-600 px-1.5 py-0.5 rounded">
                      Out ep {c.eliminated_in_episode}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
