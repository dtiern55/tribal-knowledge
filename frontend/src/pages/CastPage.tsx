import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ContestantAvatar } from '../components/ContestantAvatar'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { Torch } from '../components/Torch'
import { api, getActiveSeason } from '../lib/api'
import { rankCast } from '../lib/cast'
import type { CastMember, Season } from '../types'

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
  if (error) return <Notice tone="error" title="Could not load the cast">{error}</Notice>
  if (!season) return <Notice title="No season found">Choose an active season from the menu.</Notice>

  const ranked = rankCast(cast)

  return (
    <div>
      <PageHeader eyebrow={season.name} title="Cast" />

      {ranked.length === 0 ? (
        <Notice title="Cast not added yet">Contestants will appear here once the commissioner adds them.</Notice>
      ) : (
        <ol className="space-y-2">
          {ranked.map((member) => {
            const eliminated = member.eliminated_in_episode != null
            return (
              <li key={member.id}>
                <Link
                  to={`/contestants/${member.id}`}
                  className={`flex items-center justify-between gap-2 rounded-lg border border-cream-200 bg-white p-3 font-medium transition-colors hover:border-forest-300 hover:text-forest-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-600 ${
                    eliminated ? 'text-gray-500' : 'text-gray-900'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="shrink-0"
                      title={eliminated ? `Voted out · episode ${member.eliminated_in_episode}` : 'Still in the game'}
                    >
                      <Torch lit={!eliminated} />
                    </span>
                    <span className={eliminated ? 'grayscale opacity-70' : undefined}>
                      <ContestantAvatar
                        name={member.name}
                        imageUrl={member.image_url}
                        tribeColor={member.tribe_color}
                        tribeName={member.tribe_name}
                      />
                    </span>
                    <span className={`min-w-0 truncate ${eliminated ? 'line-through decoration-stone-300' : ''}`}>
                      {member.name}
                    </span>
                    {member.placement != null ? (
                      <span className="rounded bg-gold-50 px-2 py-1 text-[11px] uppercase tracking-wide text-gold-700">
                        #{member.placement}
                      </span>
                    ) : eliminated ? (
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-stone-400">
                        ep {member.eliminated_in_episode}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right text-sm font-semibold ${
                      member.total_points > 0
                        ? 'text-jade-600'
                        : member.total_points < 0
                          ? 'text-terracotta-500'
                          : 'text-gray-500'
                    }`}
                  >
                    {member.total_points > 0 ? '+' : ''}{member.total_points} pts
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
