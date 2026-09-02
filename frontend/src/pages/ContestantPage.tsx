import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { ContestantPortrait } from '../components/ContestantPortrait'
import { ELIMINATED_DIM } from '../components/ContestantAvatar'
import { HeaderPager } from '../components/HeaderPager'
import { Notice } from '../components/Notice'
import { PageLoader } from '../components/PageLoader'
import { SectionShell } from '../components/SectionShell'
import { useAuth } from '../auth/useAuth'
import { api, getActiveSeason } from '../lib/api'
import { castStatus } from '../lib/cast'
import { useSwipeNav } from '../lib/swipe'
import type { CastMember, ContestantPerformance, RosterPick, ScoringBreakdown } from '../types'

function Points({ value, suffix = 'pts' }: { value: number; suffix?: string }) {
  const color = value > 0 ? 'text-jade-700' : value < 0 ? 'text-terracotta-600' : 'text-paper-ink-faded'
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
  // Arriving from My Season is a different context: you're looking at one of
  // *your* castaways, so the siblings you swipe through are the rest of your
  // roster, not the whole cast, and the points shown are the ones they earned
  // you — doubles and all.
  const fromRoster = searchParams.get('from') === 'roster'
  const { session } = useAuth()
  const userId = session?.user?.id
  const [rosterIds, setRosterIds] = useState<string[] | null>(null)
  const [earnedForYou, setEarnedForYou] = useState<number | null>(null)
  // Each episode is its own collapsed row, matching the roster breakdown (#257).
  const [openEps, setOpenEps] = useState<Set<number>>(new Set())
  const toggleEp = (n: number) =>
    setOpenEps((cur) => {
      const next = new Set(cur)
      if (!next.delete(n)) next.add(n)
      return next
    })
  const backHref = fromRoster ? '/my-season' : castQuery ? `/cast?${castQuery}` : '/cast'
  const detailSuffix = fromRoster
    ? '?from=roster'
    : castQuery
      ? `?cast=${encodeURIComponent(castQuery)}`
      : ''

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
      .then((season) => season && api.get<CastMember[]>(`/seasons/${season.season_id}/cast`))
      .then((rows) => live && rows && setCast(rows))
      .catch(() => {})
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!fromRoster || !userId) return
    let live = true
    void getActiveSeason()
      .then(async (season) => {
        if (!season) return
        const [picks, breakdown] = await Promise.all([
          api.get<RosterPick[]>(`/league-seasons/${season.id}/roster/${userId}`),
          api.get<ScoringBreakdown>(`/league-seasons/${season.id}/scoring-breakdown/${userId}`),
        ])
        if (!live) return
        setRosterIds(
          picks.filter((p) => p.active_until_episode === null).map((p) => p.contestant_id),
        )
        setEarnedForYou(
          breakdown.roster.find((r) => r.contestant_id === contestantId)?.points ?? 0,
        )
      })
      .catch(() => live && setRosterIds([]))
    return () => { live = false }
  }, [fromRoster, userId, contestantId])

  // Same order My Season shows them in, so swiping matches the list you left.
  const siblings =
    fromRoster && rosterIds
      ? rosterIds
          .map((id) => cast.find((member) => member.id === id))
          .filter((member): member is CastMember => member != null)
          .sort(
            (a, b) =>
              Number(a.eliminated_in_episode != null) - Number(b.eliminated_in_episode != null),
          )
      : cast
  const idx = siblings.findIndex((member) => member.id === contestantId)
  const prevC = idx > 0 ? siblings[idx - 1] : undefined
  const nextC = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined
  const href = (member?: CastMember) => member && `/contestants/${member.id}${detailSuffix}`
  useSwipeNav(href(prevC), href(nextC))

  // Only the first load gets the full torch loader. Swiping to a sibling keeps
  // the current castaway on screen (softly dimmed) until the next arrives, so
  // stepping through entries doesn't strobe a loader between each one (#451).
  if (loading && !perf) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load this castaway">{error}</Notice>
  if (!perf) return <Notice title="Contestant not found"><Link className="text-forest-700 underline" to={backHref}>{fromRoster ? 'Return to My Season' : 'Return to the cast'}</Link></Notice>

  const eliminated = perf.eliminated_in_episode != null
  // Only surface a status chip when it says something — a placement or a boot.
  // "Still in the game" is the default and adds nothing.
  const showStatus = perf.placement != null || eliminated
  // Any of the three can be missing for a season imported before #262.
  const bioFacts = [
    perf.age != null && `${perf.age}`,
    perf.occupation,
    perf.hometown,
  ].filter((fact): fact is string => Boolean(fact))
  // Newest episode first — the most recent airing is what you check.
  const sortedEps = [...perf.episodes].sort((a, b) => b.episode_number - a.episode_number)
  const allEpsOpen = sortedEps.length > 0 && sortedEps.every((e) => openEps.has(e.episode_number))

  return (
    <div aria-busy={loading} className={`transition-opacity duration-150 ${loading ? 'opacity-60' : ''}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          to={backHref}
          aria-label={fromRoster ? 'Back to My Season' : 'Back to cast'}
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-terracotta-700 hover:underline"
        >
          <span aria-hidden>‹</span> {fromRoster ? 'My Season' : 'Cast'}
        </Link>
        <HeaderPager prev={href(prevC)} next={href(nextC)} prevLabel={prevC?.name} nextLabel={nextC?.name} />
      </div>

      <header className="grid gap-5 border-b border-cream-200 pb-7 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-end md:grid-cols-[15rem_minmax(0,1fr)]">
        {/* The mount frame carries the tribe color, the portrait's counterpart
            to the tribe-color ring on avatars elsewhere (#369/#212). Eliminated
            castaways fall back to the neutral paper edge — a vivid frame around
            a greyed-out photo reads wrong. */}
        <div
          className="mx-auto w-full max-w-60 overflow-hidden rounded-2xl border-2 border-paper-edge record-paper shadow-sm sm:mx-0"
          style={{ borderColor: !eliminated && perf.tribe_color ? perf.tribe_color : undefined }}
        >
          <ContestantPortrait name={perf.name} imageUrl={perf.image_url} className={eliminated ? ELIMINATED_DIM : ''} />
        </div>
        <div className="min-w-0">
          {showStatus && (
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${eliminated ? 'bg-cream-200 text-paper-ink-faded' : 'bg-forest-50 text-forest-800'}`}>
              {castStatus(perf)}
            </span>
          )}
          <h1 className={`font-display text-3xl tracking-wide text-forest-900 md:text-5xl ${showStatus ? 'mt-3' : ''}`}>{perf.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
            <span className="inline-flex items-center gap-2">
              {perf.tribe_name ? (
                <>
                  <span className="tribe-marker" style={{ backgroundColor: perf.tribe_color ?? undefined }} aria-hidden="true" />
                  <strong className="font-medium text-gray-800">{perf.tribe_name} tribe</strong>
                </>
              ) : 'No tribe assigned'}
            </span>
            <span aria-hidden>·</span>
            <Points value={perf.total_points} suffix="season points" />
            {fromRoster && earnedForYou != null && (
              <>
                <span aria-hidden>·</span>
                <span
                  className="inline-flex items-center gap-1"
                  title="Includes Double Castaway Points and any Sole Survivor bonus, and only the episodes they were on your roster"
                >
                  <Points value={earnedForYou} suffix="for you" />
                </span>
              </>
            )}
          </div>
          {bioFacts.length > 0 && (
            <p className="mt-2 text-sm text-gray-600">{bioFacts.join(' · ')}</p>
          )}
          {perf.bio ? (
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-gray-600">{perf.bio}</p>
          ) : (
            <p className="mt-5 max-w-xl text-sm italic leading-relaxed text-gray-500">
              Bio coming soon — {perf.name}'s background and story will live here once bios are added.
            </p>
          )}
        </div>
      </header>

      <div className="mt-8">
        <SectionShell title="Episodes" prominent>
          {perf.episodes.length === 0 ? (
            <Notice title="No scored activity yet">Episode scoring will appear here once this castaway earns or loses points.</Notice>
          ) : (
            <>
              {sortedEps.length > 1 && (
                <div className="mb-2 flex justify-end">
                  <button
                    onClick={() => setOpenEps(allEpsOpen ? new Set() : new Set(sortedEps.map((e) => e.episode_number)))}
                    className="text-[11px] font-semibold uppercase tracking-wide text-forest-700 underline underline-offset-2"
                  >
                    {allEpsOpen ? 'Collapse all' : 'Expand all'}
                  </button>
                </div>
              )}
              <ol className="space-y-3">
                {sortedEps.map((episode) => {
                  const events = episode.events.filter((event) => event.points !== 0 || event.token_value !== 0)
                  const open = openEps.has(episode.episode_number)
                  return (
                    <li key={episode.episode_number} className="overflow-hidden rounded-2xl border border-paper-edge record-paper">
                      <button
                        onClick={() => toggleEp(episode.episode_number)}
                        aria-expanded={open}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
                      >
                        <span className="flex flex-col items-start">
                          <span className="font-semibold text-paper-ink">Ep {episode.episode_number}</span>
                          {episode.is_finale && <span className="text-xs font-medium uppercase tracking-wide text-terracotta-700">Finale</span>}
                        </span>
                        <span className="ml-auto"><Points value={episode.points} /></span>
                        <svg
                          viewBox="0 0 24 24"
                          className={`size-4 shrink-0 text-paper-ink-faded transition-transform ${open ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden="true"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                      {open && (
                        <div className="border-t border-paper-line px-4 py-3 sm:px-5">
                          {events.length > 0 ? (
                            <ul className="space-y-2 text-sm text-paper-ink-faded">
                              {[...events]
                                .sort((a, b) => Number(a.points === 0) - Number(b.points === 0))
                                .map((event, index) => (
                                  <li key={index} className="flex items-start justify-between gap-3">
                                    <span>{event.label}{event.quantity > 1 && <span className="font-medium text-paper-ink-faded"> ×{event.quantity}</span>}</span>
                                    <span className="flex shrink-0 flex-wrap justify-end gap-2 text-xs">
                                      {event.points !== 0 && <Points value={event.points} />}
                                      {event.token_value !== 0 && (
                                        episode.tokens_locked ? (
                                          <span className="text-paper-ink-faded line-through" title="Advantages were locked; no tokens were granted">+{event.token_value} tokens</span>
                                        ) : <span className="font-medium text-gold-600">+{event.token_value} tokens</span>
                                      )}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          ) : <p className="text-sm text-paper-ink-faded">No point-scoring events this episode.</p>}
                          {episode.eliminated_type && (
                            <p className="mt-3 rounded-lg bg-cream-200 px-3 py-2 text-sm text-paper-ink-faded">
                              Eliminated · {episode.eliminated_type.replace(/_/g, ' ')}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </SectionShell>
      </div>
    </div>
  )
}
