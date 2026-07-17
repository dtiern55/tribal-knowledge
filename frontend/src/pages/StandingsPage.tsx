import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import type { Season, StandingEntry } from '../types'

export function StandingsPage() {
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
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{season.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Standings</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-200">
            <th className="pb-2 font-medium w-8">#</th>
            <th className="pb-2 font-medium">Player</th>
            <th className="pb-2 font-medium text-right">Roster</th>
            <th className="pb-2 font-medium text-right">Elim</th>
            <th className="pb-2 font-medium text-right">Finale</th>
            <th className="pb-2 font-medium text-right">Winner</th>
            <th className="pb-2 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, i) => (
            <tr key={entry.user_id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-3 text-gray-400">{i + 1}</td>
              <td className="py-3 font-medium text-gray-900">{entry.display_name}</td>
              <td className="py-3 text-right text-gray-700">{entry.roster_points}</td>
              <td className="py-3 text-right text-gray-700">{entry.elimination_points}</td>
              <td className="py-3 text-right text-gray-700">{entry.finale_points}</td>
              <td className="py-3 text-right text-gray-700">{entry.winner_points}</td>
              <td className="py-3 text-right font-semibold text-gray-900">
                {entry.total_points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
