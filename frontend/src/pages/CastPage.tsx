import { useEffect, useState } from 'react'
import { PageLoader } from '../components/PageLoader'
import { Link } from 'react-router'
import { api, getActiveSeason } from '../lib/api'
import { ContestantAvatar } from '../components/ContestantAvatar'
import { Torch } from '../components/Torch'
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

  if (loading) return <PageLoader />
  if (error) return <p className="text-red-600">{error}</p>
  if (!season) return <p className="text-gray-500">No season found.</p>

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl tracking-wide text-ocean-800 mb-1">{season.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Cast · base score, no advantages applied</p>
      <ul className="space-y-2">
        {cast.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between p-3 bg-white border border-sand-200 rounded-lg"
          >
            <Link
              to={`/contestants/${c.id}`}
              className={`flex items-center gap-2 font-medium hover:text-ocean-700 ${
                c.eliminated_in_episode != null ? 'text-gray-500' : 'text-gray-900'
              }`}
            >
              <span
                className="shrink-0"
                title={
                  c.eliminated_in_episode != null
                    ? `Voted out · episode ${c.eliminated_in_episode}`
                    : 'Still in the game'
                }
              >
                <Torch lit={c.eliminated_in_episode == null} />
              </span>
              <span className={c.eliminated_in_episode != null ? 'grayscale opacity-70' : undefined}>
                <ContestantAvatar
                  name={c.name}
                  imageUrl={c.image_url}
                  tribeColor={c.tribe_color}
                  tribeName={c.tribe_name}
                />
              </span>
              <span className={c.eliminated_in_episode != null ? 'line-through decoration-stone-300' : undefined}>
                {c.name}
              </span>
              {c.placement != null ? (
                <span className="text-[10px] uppercase tracking-wide bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">
                  #{c.placement}
                </span>
              ) : (
                c.eliminated_in_episode != null && (
                  <span className="text-[10px] uppercase tracking-wide text-stone-400">
                    ep {c.eliminated_in_episode}
                  </span>
                )
              )}
            </Link>
            {/* Fixed-width right-aligned columns so rows line up whether or
                not tokens exist (#133); tokens deliberately quieter. */}
            <span className="flex items-center text-sm shrink-0">
              <span
                className={`w-16 text-right font-semibold ${
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
              <span className="w-14 text-right text-[11px] text-amber-500/70">
                {c.total_tokens > 0 ? `+${c.total_tokens} tkn` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
