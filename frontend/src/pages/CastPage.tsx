import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ColdStart } from '../components/ColdStart'
import { ContestantAvatar, ELIMINATED_DIM, ELIMINATED_STRIKE } from '../components/ContestantAvatar'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
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
        if (active) setCast(await api.get<CastMember[]>(`/seasons/${active.season_id}/cast`))
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
  if (!season) return <ColdStart />

  const ranked = rankCast(cast)

  return (
    <div>
      <PageHeader eyebrow={season.name} title="Cast" />

      {ranked.length === 0 ? (
        <Notice title="Cast not added yet">Contestants will appear here once the commissioner adds them.</Notice>
      ) : (
        <ol className="divide-y divide-cream-300 border-b border-cream-300">
          {ranked.map((member) => {
            const eliminated = member.eliminated_in_episode != null
            return (
              <li key={member.id}>
                <Link
                  to={`/contestants/${member.id}`}
                  className={`flex items-center justify-between gap-3 px-1 py-3 transition-colors hover:bg-cream-50/70 hover:text-forest-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-600 ${
                    eliminated ? 'text-gray-500' : 'text-gray-900'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={eliminated ? ELIMINATED_DIM : undefined}>
                      <ContestantAvatar
                        name={member.name}
                        imageUrl={member.image_url}
                        tribeColor={member.tribe_color}
                        tribeName={member.tribe_name}
                      />
                    </span>
                    {/* Name and tribe on one line — the avatar's tribe-color
                        ring already carries the colour, so the tribe reads as a
                        quiet label beside the name rather than a second row. */}
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className={`truncate font-display text-lg font-semibold ${eliminated ? ELIMINATED_STRIKE : ''}`}>
                        {member.name}
                      </span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wide text-stone-400">
                        {member.tribe_name ?? 'No tribe'}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    {member.placement != null ? (
                      <span className="rounded bg-gold-50 px-2 py-1 text-[11px] uppercase tracking-wide text-gold-700">
                        #{member.placement}
                        {member.final_episode != null && ` · ep ${member.final_episode}`}
                      </span>
                    ) : eliminated ? (
                      <span className="text-[11px] uppercase tracking-wide text-stone-400">
                        ep {member.eliminated_in_episode}
                      </span>
                    ) : null}
                    <span
                      className={`w-16 text-right font-display text-lg font-bold ${
                        member.total_points > 0
                          ? 'text-jade-700'
                          : member.total_points < 0
                            ? 'text-terracotta-500'
                            : 'text-gray-500'
                      }`}
                    >
                      {member.total_points > 0 ? '+' : ''}{member.total_points} pts
                    </span>
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
