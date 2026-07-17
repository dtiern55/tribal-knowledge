import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, getActiveSeason } from '../lib/api'
import { useAuth } from '../auth/useAuth'
import type { Season, StandingEntry } from '../types'

function Trend({ t }: { t: StandingEntry['trend'] }) {
  if (t === 'up')
    return (
      <span className="text-jungle-600" title="Up since last episode">
        ▲
      </span>
    )
  if (t === 'down')
    return (
      <span className="text-red-500" title="Down since last episode">
        ▼
      </span>
    )
  if (t === 'same')
    return (
      <span className="text-gray-300" title="No change">
        –
      </span>
    )
  return null
}

const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null)

export function StandingsPage() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [entries, setEntries] = useState<StandingEntry[]>([])
  const [season, setSeason] = useState<Season | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const active = await getActiveSeason()
        setSeason(active)
        if (active) {
          const data = await api.get<StandingEntry[]>(`/seasons/${active.id}/standings`)
          setEntries(data)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load standings')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!season) return <p className="text-gray-500">No season found.</p>

  return (
    <div>
      <h1 className="font-display text-3xl tracking-wide text-ocean-800 mb-1">Standings</h1>
      <p className="text-sm text-gray-500 mb-6">{season.name}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ocean-700 border-b-2 border-ocean-100">
              <th className="pb-2 font-semibold w-12">#</th>
              <th className="pb-2 font-semibold">Player</th>
              <th className="pb-2 font-semibold text-right">Roster</th>
              <th className="pb-2 font-semibold text-right">Elim</th>
              <th className="pb-2 font-semibold text-right">Finale</th>
              <th className="pb-2 font-semibold text-right">Winner</th>
              <th className="pb-2 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const isMe = entry.user_id === userId
              return (
                <tr
                  key={entry.user_id}
                  className={`border-b border-sand-100 ${
                    isMe ? 'bg-ocean-50' : 'hover:bg-sand-100/60'
                  }`}
                >
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1">
                      <span className={medal(i) ? 'text-base' : 'text-gray-400 w-4 text-center'}>
                        {medal(i) ?? i + 1}
                      </span>
                      <Trend t={entry.trend} />
                    </span>
                  </td>
                  <td className="py-3 font-medium whitespace-nowrap">
                    <Link
                      to={`/seasons/${season.id}/team/${entry.user_id}`}
                      className="text-gray-900 hover:text-ocean-700"
                    >
                      {entry.display_name}
                    </Link>
                    {isMe && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide bg-ocean-600 text-white px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right text-gray-700">{entry.roster_points}</td>
                  <td className="py-3 text-right text-gray-700">{entry.elimination_points}</td>
                  <td className="py-3 text-right text-gray-700">{entry.finale_points}</td>
                  <td className="py-3 text-right text-gray-700">{entry.winner_points}</td>
                  <td className="py-3 text-right font-bold text-ocean-800">
                    {entry.total_points}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
