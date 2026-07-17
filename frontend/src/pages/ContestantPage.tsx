import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api } from '../lib/api'
import { ContestantAvatar } from '../components/ContestantAvatar'
import type { ContestantPerformance } from '../types'

export function ContestantPage() {
  const { contestantId } = useParams()
  const navigate = useNavigate()
  const [perf, setPerf] = useState<ContestantPerformance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!contestantId) return
    api
      .get<ContestantPerformance>(`/contestants/${contestantId}/performance`)
      .then(setPerf)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [contestantId])

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!perf) return <p className="text-gray-500">Contestant not found.</p>

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-indigo-600 hover:text-indigo-800"
      >
        ← Back
      </button>
      <div className="flex items-center gap-3 mt-3 mb-1">
        <ContestantAvatar name={perf.name} imageUrl={perf.image_url} size="md" />
        <h1 className="text-2xl font-semibold text-gray-900">{perf.name}</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {perf.total_points} pts total
        {perf.placement != null && ` · placed #${perf.placement}`}
        {perf.eliminated_in_episode != null &&
          perf.placement == null &&
          ` · out episode ${perf.eliminated_in_episode}`}
      </p>

      {perf.episodes.length === 0 ? (
        <p className="text-sm text-gray-500">No scored activity yet.</p>
      ) : (
        <div className="space-y-3">
          {perf.episodes.map((ep) => (
            <div key={ep.episode_number} className="p-4 bg-white border border-gray-200 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-800">Episode {ep.episode_number}</span>
                <span
                  className={`text-sm font-semibold ${
                    ep.points > 0 ? 'text-green-600' : ep.points < 0 ? 'text-red-500' : 'text-gray-400'
                  }`}
                >
                  {ep.points > 0 ? '+' : ''}
                  {ep.points} pts
                </span>
              </div>
              {ep.events.length > 0 && (
                <ul className="text-sm text-gray-600 space-y-0.5">
                  {ep.events.map((e, i) => (
                    <li key={i} className="flex items-center justify-between gap-2">
                      <span>{e.label}</span>
                      <span className="flex items-center gap-1.5 shrink-0 text-xs font-medium">
                        {e.points !== 0 && (
                          <span className={e.points > 0 ? 'text-green-600' : 'text-red-500'}>
                            {e.points > 0 ? '+' : ''}
                            {e.points} pts
                          </span>
                        )}
                        {e.token_value !== 0 && (
                          <span className="text-amber-500">+{e.token_value} tkn</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {ep.eliminated_type && (
                <p className="text-sm text-red-600 mt-1">
                  Eliminated — {ep.eliminated_type.replace(/_/g, ' ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
