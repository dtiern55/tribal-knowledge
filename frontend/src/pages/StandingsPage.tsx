import { useEffect, useState } from 'react'
import { PageLoader } from '../components/PageLoader'
import { Link } from 'react-router'
import { api, getActiveSeason } from '../lib/api'
import { useAuth } from '../auth/useAuth'
import type { Season, StandingEntry } from '../types'

function Trend({ t, delta }: { t: StandingEntry['trend']; delta: number }) {
  if (t === 'up')
    return (
      <span
        className="text-jungle-600 text-xs font-medium"
        title={`Up ${delta} since last episode`}
      >
        ▲{delta}
      </span>
    )
  if (t === 'down')
    return (
      <span
        className="text-red-500 text-xs font-medium"
        title={`Down ${delta} since last episode`}
      >
        ▼{delta}
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

// Top-3 rank chips replace the old emoji medals (#106): gold/silver/bronze
const RANK_CHIP = [
  'bg-amber-400 text-white',
  'bg-gray-300 text-gray-600',
  'bg-amber-700/70 text-white',
]

export function StandingsPage() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [entries, setEntries] = useState<StandingEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Standings follows the app-wide active season; switching happens in the
  // nav drawer now (#219), not here.
  useEffect(() => {
    Promise.all([api.get<Season[]>('/seasons'), getActiveSeason()])
      .then(([ss, current]) => {
        setSeasons(ss)
        setSelectedId(current?.id ?? '')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load seasons'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedId) return
    api
      .get<StandingEntry[]>(`/seasons/${selectedId}/standings`)
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load standings'))
  }, [selectedId])

  if (loading) return <PageLoader />
  if (error) return <p className="text-red-600">{error}</p>
  const season = seasons.find((s) => s.id === selectedId)
  if (!season) return <p className="text-gray-500">No season found.</p>

  // Finale/Winner are 0 until the season ends — hide them until they matter.
  const showFinale = entries.some((e) => e.finale_points !== 0)
  const showWinner = entries.some((e) => e.winner_points !== 0)

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h1 className="font-display text-3xl tracking-wide text-ocean-800">Standings</h1>
        <span className="text-sm text-gray-500">{season.name}</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {season.status === 'completed' ? 'Final standings' : 'Standings'}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ocean-700 border-b-2 border-ocean-100">
              <th className="pb-2 font-semibold w-12">#</th>
              <th className="pb-2 font-semibold">Player</th>
              <th className="pb-2 font-semibold text-right hidden sm:table-cell">Roster</th>
              <th className="pb-2 font-semibold text-right hidden sm:table-cell">Elim</th>
              {showFinale && (
                <th className="pb-2 font-semibold text-right hidden sm:table-cell">Finale</th>
              )}
              {showWinner && (
                <th className="pb-2 font-semibold text-right hidden sm:table-cell">Winner</th>
              )}
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
                      {i < RANK_CHIP.length ? (
                        <span
                          className={`w-5 h-5 rounded-full text-[10px] font-semibold inline-flex items-center justify-center ${RANK_CHIP[i]}`}
                        >
                          {i + 1}
                        </span>
                      ) : (
                        <span className="text-gray-400 w-5 text-center">
                          {i + 1}
                        </span>
                      )}
                      <Trend t={entry.trend} delta={entry.trend_delta} />
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
                      <span className="ml-2 text-[10px] uppercase tracking-wide bg-jungle-600 text-white px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right text-gray-700 hidden sm:table-cell">
                    {entry.roster_points}
                  </td>
                  <td className="py-3 text-right text-gray-700 hidden sm:table-cell">
                    {entry.elimination_points}
                  </td>
                  {showFinale && (
                    <td className="py-3 text-right text-gray-700 hidden sm:table-cell">
                      {entry.finale_points}
                    </td>
                  )}
                  {showWinner && (
                    <td className="py-3 text-right text-gray-700 hidden sm:table-cell">
                      {entry.winner_points}
                    </td>
                  )}
                  <td className="py-3 text-right font-bold text-ocean-800 whitespace-nowrap">
                    {entry.total_points}
                    {entry.last_episode_points !== 0 && (
                      <span
                        className={`ml-1 text-xs font-medium ${
                          entry.last_episode_points > 0 ? 'text-green-600' : 'text-red-500'
                        }`}
                      >
                        ({entry.last_episode_points > 0 ? '+' : ''}
                        {entry.last_episode_points})
                      </span>
                    )}
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
