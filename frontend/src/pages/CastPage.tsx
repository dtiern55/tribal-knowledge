import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ColdStart } from '../components/ColdStart'
import { ContestantAvatar, ELIMINATED_DIM, ELIMINATED_STRIKE } from '../components/ContestantAvatar'
import { ChevronRightIcon } from '../components/icons'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { rankCast } from '../lib/cast'
import { pathQuery, useActiveSeason } from '../lib/queries'
import type { CastMember } from '../types'

export function CastPage() {
  const { season, isLoading: seasonLoading, error: seasonError } = useActiveSeason()
  const cast = useQuery(pathQuery<CastMember[]>(season ? `/seasons/${season.season_id}/cast` : null))

  if (seasonLoading || cast.isLoading) return <PageLoader />
  const error = seasonError ?? cast.error
  if (error) return <Notice tone="error" title="Could not load the cast">{error.message}</Notice>
  if (!season) return <ColdStart />

  const ranked = rankCast(cast.data ?? [])

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
                      {member.tribe_name && (
                        <span className="shrink-0 text-[11px] uppercase tracking-wide text-stone-400">
                          {member.tribe_name}
                        </span>
                      )}
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
                    {/* A row opens the bio; without the caret new players didn't know. */}
                    <ChevronRightIcon className="-ml-1 size-[16px] text-stone-400" />
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
