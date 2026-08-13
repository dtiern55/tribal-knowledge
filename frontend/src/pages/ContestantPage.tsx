import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ContestantPortrait } from '../components/ContestantPortrait'
import { Notice } from '../components/Notice'
import { PageLoader } from '../components/PageLoader'
import { SwipeNavBar } from '../components/SwipeNav'
import { api, getActiveSeason } from '../lib/api'
import { castStatus } from '../lib/cast'
import { useSwipeNav } from '../lib/swipe'
import type { CastMember, ContestantPerformance } from '../types'

function Points({ value, suffix = 'pts' }: { value: number; suffix?: string }) {
  const color = value > 0 ? 'text-green-700' : value < 0 ? 'text-red-600' : 'text-gray-600'
  return <span className={`font-semibold ${color}`}>{value > 0 ? '+' : ''}{value} {suffix}</span>
}

export function ContestantPage() {
  const { contestantId } = useParams()
  const [searchParams] = useSearchParams()
  const [perf, setPerf] = useState<ContestantPerformance | null>(null)
  const [cast, setCast] = useState<CastMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const castQuery = searchParams.get('cast')
  const backHref = castQuery ? `/cast?${castQuery}` : '/cast'
  const detailSuffix = castQuery ? `?cast=${encodeURIComponent(castQuery)}` : ''

  useEffect(() => {
    if (!contestantId) return
    setLoading(true)
    setError(null)
    api
      .get<ContestantPerformance>(`/contestants/${contestantId}/performance`)
      .then(setPerf)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load contestant'))
      .finally(() => setLoading(false))
  }, [contestantId])

  useEffect(() => {
    let live = true
    void getActiveSeason()
      .then((season) => season && api.get<CastMember[]>(`/seasons/${season.id}/cast`))
      .then((rows) => live && rows && setCast(rows))
      .catch(() => {})
    return () => { live = false }
  }, [])

  const idx = cast.findIndex((member) => member.id === contestantId)
  const prevC = idx > 0 ? cast[idx - 1] : undefined
  const nextC = idx >= 0 && idx < cast.length - 1 ? cast[idx + 1] : undefined
  const href = (member?: CastMember) => member && `/contestants/${member.id}${detailSuffix}`
  useSwipeNav(href(prevC), href(nextC))

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load this castaway">{error}</Notice>
  if (!perf) return <Notice title="Contestant not found"><Link className="text-ocean-700 underline" to={backHref}>Return to the cast</Link></Notice>

  const eliminated = perf.eliminated_in_episode != null
  const scoredEpisodes = perf.episodes.filter((episode) => episode.events.some((event) => event.points !== 0 || event.token_value !== 0))
  const bestEpisode = perf.episodes.reduce<(typeof perf.episodes)[number] | null>(
    (best, episode) => best == null || episode.points > best.points ? episode : best,
    null,
  )

  return (
    <div>
      <Link to={backHref} className="text-sm font-medium text-ocean-700 hover:text-ocean-900">← Back to cast</Link>

      <header className="mt-4 grid gap-5 border-b border-sand-200 pb-7 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-end md:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="mx-auto w-full max-w-60 overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-sm sm:mx-0">
          <ContestantPortrait name={perf.name} imageUrl={perf.image_url} className={eliminated ? 'grayscale opacity-80' : ''} />
        </div>
        <div className="min-w-0">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${eliminated ? 'bg-stone-200 text-stone-700' : 'bg-jungle-100 text-jungle-800'}`}>
            {castStatus(perf)}
          </span>
          <h1 className="mt-3 font-display text-3xl tracking-wide text-ocean-900 md:text-5xl">{perf.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
            <span className="inline-flex items-center gap-2">
              {perf.tribe_name ? (
                <>
                  <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: perf.tribe_color ?? undefined }} />
                  <strong className="font-medium text-gray-800">{perf.tribe_name} tribe</strong>
                </>
              ) : 'No tribe assigned'}
            </span>
            <span aria-hidden>·</span>
            <Points value={perf.total_points} suffix="season points" />
          </div>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-gray-500">
            Biography details have not been added for this castaway yet.
          </p>
        </div>
      </header>

      <section className="mt-8" aria-labelledby="season-performance-title">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ember-700">Season performance</p>
          <h2 id="season-performance-title" className="mt-1 font-display text-2xl tracking-wide text-ocean-900">Scoring history</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-3">
          <div className="rounded-xl border border-sand-200 bg-white p-4">
            <p className="text-xs text-gray-500">Total points</p>
            <p className="mt-1 text-2xl"><Points value={perf.total_points} suffix="" /></p>
          </div>
          <div className="rounded-xl border border-sand-200 bg-white p-4">
            <p className="text-xs text-gray-500">Episodes with activity</p>
            <p className="mt-1 text-2xl font-bold text-ocean-900">{scoredEpisodes.length}</p>
          </div>
          <div className="rounded-xl border border-sand-200 bg-white p-4">
            <p className="text-xs text-gray-500">Best episode</p>
            {bestEpisode && scoredEpisodes.length > 0 ? (
              <p className="mt-1 text-lg font-bold text-ocean-900">Ep {bestEpisode.episode_number} <span className="text-sm"><Points value={bestEpisode.points} /></span></p>
            ) : <p className="mt-1 text-sm font-medium text-gray-500">Not scored yet</p>}
          </div>
        </div>

        {perf.episodes.length === 0 ? (
          <div className="mt-6"><Notice title="No scored activity yet">Episode scoring will appear here once this castaway earns or loses points.</Notice></div>
        ) : (
          <ol className="mt-6 space-y-3">
            {[...perf.episodes].sort((a, b) => b.episode_number - a.episode_number).map((episode) => {
              const events = episode.events.filter((event) => event.points !== 0 || event.token_value !== 0)
              return (
                <li key={episode.episode_number} className="rounded-2xl border border-sand-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-sand-100 pb-3">
                    <div>
                      <p className="font-semibold text-gray-900">Episode {episode.episode_number}</p>
                      {episode.is_finale && <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ember-700">Finale</p>}
                    </div>
                    <Points value={episode.points} />
                  </div>
                  {events.length > 0 ? (
                    <ul className="mt-3 space-y-2 text-sm text-gray-600">
                      {[...events]
                        .sort((a, b) => Number(a.points === 0) - Number(b.points === 0))
                        .map((event, index) => (
                          <li key={index} className="flex items-start justify-between gap-3">
                            <span>{event.label}{event.quantity > 1 && <span className="font-medium text-gray-500"> ×{event.quantity}</span>}</span>
                            <span className="flex shrink-0 flex-wrap justify-end gap-2 text-xs">
                              {event.points !== 0 && <Points value={event.points} />}
                              {event.token_value !== 0 && (
                                episode.tokens_locked ? (
                                  <span className="text-gray-500 line-through" title="Advantages were locked; no tokens were granted">+{event.token_value} tokens</span>
                                ) : <span className="font-medium text-amber-600">+{event.token_value} tokens</span>
                              )}
                            </span>
                          </li>
                        ))}
                    </ul>
                  ) : <p className="mt-3 text-sm text-gray-500">No point-scoring events this episode.</p>}
                  {episode.eliminated_type && (
                    <p className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700">
                      Eliminated · {episode.eliminated_type.replace(/_/g, ' ')}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <SwipeNavBar prev={href(prevC)} next={href(nextC)} prevLabel={prevC?.name} nextLabel={nextC?.name} />
    </div>
  )
}
