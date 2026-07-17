import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, getActiveSeason } from '../lib/api'
import { ContestantAvatar } from '../components/ContestantAvatar'
import type { CastMember, Season } from '../types'

// Full cast list: every contestant's base gameplay score (no advantages
// applied), sorted high to low. Each name links to their detail page.
export function CastPage() {
  const [cast, setCast] = useState<CastMember[]>([])
  const [season, setSeason] = useState<Season | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const active = await getActiveSeason()
        setSeason(active)
        if (active) setCast(await api.get<CastMember[]>(`/seasons/${active.id}/cast`))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load cast')
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
      <p className="text-sm text-gray-500 mb-6">Cast · base score, no advantages applied</p>
      <ul className="space-y-2">
        {cast.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
          >
            <Link
              to={`/contestants/${c.id}`}
              className="flex items-center gap-2 font-medium text-gray-900 hover:text-indigo-700"
            >
              <ContestantAvatar name={c.name} imageUrl={c.image_url} />
              {c.name}
              {c.placement != null ? (
                <span className="text-[10px] uppercase tracking-wide bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">
                  #{c.placement}
                </span>
              ) : (
                c.eliminated_in_episode != null && (
                  <span className="text-[10px] uppercase tracking-wide bg-red-50 text-red-600 px-1.5 py-0.5 rounded">
                    Out ep {c.eliminated_in_episode}
                  </span>
                )
              )}
            </Link>
            <span className="flex items-center gap-2 text-sm shrink-0">
              <span
                className={`font-semibold ${
                  c.total_points > 0
                    ? 'text-green-600'
                    : c.total_points < 0
                      ? 'text-red-500'
                      : 'text-gray-400'
                }`}
              >
                {c.total_points > 0 ? '+' : ''}
                {c.total_points} pts
              </span>
              {c.total_tokens > 0 && (
                <span className="text-xs text-amber-500">+{c.total_tokens} tkn</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
