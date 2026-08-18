import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { RosterBreakdown } from '../components/RosterBreakdown'
import { RosterCard, RosterManifest } from '../components/RosterCard'
import { SectionShell } from '../components/SectionShell'
import { SwipeNavBar } from '../components/SwipeNav'
import { ADV_LABELS } from '../lib/advantages'
import { api } from '../lib/api'
import { episodeClosed } from '../lib/episodes'
import { doubledByContestantEpisode, EMPTY_EP_MAP, useRosterBreakdown } from '../lib/rosterBreakdown'
import { rankStandings } from '../lib/standings'
import { useSwipeNav } from '../lib/swipe'
import type {
  AdvantagePlay,
  Contestant,
  Elimination,
  EliminationPick,
  Episode,
  RosterPick,
  ScoringBreakdown,
  StandingEntry,
} from '../types'

interface EpisodeVotes {
  episode: Episode
  picks: EliminationPick[]
  eliminatedIds: Set<string>
}

function Points({ value }: { value: number | undefined }) {
  if (value == null) return null
  const color = value > 0 ? 'text-jade-700' : value < 0 ? 'text-terracotta-600' : 'text-gray-500'
  return <span className={`text-xs font-medium ${color}`}>{value > 0 ? '+' : ''}{value} pts</span>
}

function ScoreLane({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-xl border border-cream-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-forest-900">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">{detail}</p>
    </div>
  )
}

export function TeamPage() {
  const { seasonId, userId } = useParams()
  const [siblings, setSiblings] = useState<StandingEntry[]>([])
  const [player, setPlayer] = useState<StandingEntry | null>(null)
  const [roster, setRoster] = useState<RosterPick[]>([])
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [rosterPoints, setRosterPoints] = useState<Map<string, number>>(new Map())
  const [plays, setPlays] = useState<AdvantagePlay[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [votes, setVotes] = useState<EpisodeVotes[]>([])
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { expandedId, perfs, toggleExpand } = useRosterBreakdown()

  useEffect(() => {
    if (!seasonId || !userId) return
    async function load() {
      setLoading(true)
      setError(null)
      setHidden(false)
      setRoster([])
      setPlays([])
      setVotes([])
      try {
        const [cs, standings, episodeRows] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${seasonId}/contestants`),
          api.get<StandingEntry[]>(`/seasons/${seasonId}/standings`),
          api.get<Episode[]>(`/seasons/${seasonId}/episodes`),
        ])
        setContestants(cs)
        setEpisodes(episodeRows)
        setPlayer(standings.find((standing) => standing.user_id === userId) ?? null)
        setSiblings(standings)
        try {
          setRoster(await api.get<RosterPick[]>(`/seasons/${seasonId}/roster/${userId}`))
          const breakdown = await api.get<ScoringBreakdown>(`/seasons/${seasonId}/scoring-breakdown/${userId}`)
          setRosterPoints(new Map(breakdown.roster.map((row) => [row.contestant_id, row.points])))
          setPlays(await api.get<AdvantagePlay[]>(`/seasons/${seasonId}/advantage-plays/${userId}`).catch(() => []))
        } catch {
          setHidden(true)
        }

        const visible = episodeRows.filter(episodeClosed).sort((a, b) => b.episode_number - a.episode_number)
        setVotes(await Promise.all(visible.map(async (episode) => {
          const [picks, eliminations] = await Promise.all([
            api.get<EliminationPick[]>(`/episodes/${episode.id}/picks/${userId}`).catch(() => []),
            api.get<Elimination[]>(`/episodes/${episode.id}/eliminations`),
          ])
          return { episode, picks, eliminatedIds: new Set(eliminations.map((row) => row.contestant_id)) }
        })))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load team')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [seasonId, userId])

  const idx = siblings.findIndex((standing) => standing.user_id === userId)
  const prevP = idx > 0 ? siblings[idx - 1] : undefined
  const nextP = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined
  const href = (standing?: StandingEntry) => standing && `/seasons/${seasonId}/team/${standing.user_id}`
  useSwipeNav(href(prevP), href(nextP))

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load this team">{error}</Notice>
  if (!player) return <Notice title="Player not found"><Link className="text-forest-700 underline" to="/standings">Return to standings</Link></Notice>

  const contestantMap = new Map(contestants.map((contestant) => [contestant.id, contestant]))
  const doubledByContestantEp = doubledByContestantEpisode(plays, episodes)
  const active = roster.filter((pick) => pick.active_until_episode === null)
  const rosterBaseEp = roster.length > 0 ? Math.min(...roster.map((pick) => pick.active_from_episode)) : 0
  const swaps = roster.filter((pick) => pick.active_until_episode !== null).map((out) => ({
    out,
    into: roster.find((pick) => pick.active_from_episode === (out.active_until_episode ?? 0) + 1),
  }))
  const doubles = plays.filter((play) => play.advantage_type === 'double_vote_points')
  const scoredPlays = plays.filter((play) => play.episode_id !== null)
  const weeklyBonus = scoredPlays.reduce((total, play) => total + (play.points_earned ?? 0), 0)
  const ranked = rankStandings(siblings).find(({ entry }) => entry.user_id === userId)
  const finaleScored = episodes.some((episode) => episode.is_finale && episode.status === 'scored')

  return (
    <div>
      <Link to="/standings" className="text-sm font-medium text-forest-700 hover:text-forest-900">← Back to standings</Link>
      <div className="mt-4">
        <PageHeader
          eyebrow={ranked ? (ranked.tied ? `Tied for #${ranked.rank}` : `Rank #${ranked.rank}`) : undefined}
          title={player.display_name}
          description="Season score and the choices behind it."
          meta={<span><strong className="text-lg text-forest-900">{player.total_points}</strong> season points</span>}
        />
      </div>

      <section aria-labelledby="score-breakdown-title">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="score-breakdown-title" className="font-display text-xl tracking-wide text-forest-800">Score breakdown</h2>
            <p className="mt-1 text-xs text-gray-500">Season total = roster + ballot + finale.</p>
          </div>
          <p className="text-right text-sm font-semibold text-forest-800">{player.total_points} total</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreLane label="Roster" value={player.roster_points} detail="Points earned by active castaways." />
          <ScoreLane label="Ballot" value={player.elimination_points} detail="Points from correct elimination predictions." />
          <ScoreLane label="Weekly play bonus" value={weeklyBonus} detail="Already included in the roster or ballot total." />
          <ScoreLane label="Finale" value={player.finale_points} detail={finaleScored ? 'Finale predictions scored.' : 'Not scored yet.'} />
        </div>
      </section>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,.85fr)]">
        <section>
          <SectionShell title="Roster detail" prominent collapsible={false}>
            {hidden ? (
              <Notice title="Team details are still private">Roster and weekly-play choices unlock when rosters lock.</Notice>
            ) : active.length === 0 ? (
              <Notice title="No roster submitted">This player does not have an active roster yet.</Notice>
            ) : (
              <RosterManifest>
                {[...active]
                  .sort((a, b) => Number(contestantMap.get(a.contestant_id)?.eliminated_in_episode != null) - Number(contestantMap.get(b.contestant_id)?.eliminated_in_episode != null))
                  .map((pick) => (
                    <RosterCard
                      key={pick.id}
                      contestantId={pick.contestant_id}
                      contestant={contestantMap.get(pick.contestant_id)}
                      isSoleSurvivor={pick.is_sole_survivor}
                      swappedInEpisode={pick.active_from_episode > rosterBaseEp ? pick.active_from_episode : null}
                      right={<Points value={rosterPoints.get(pick.contestant_id)} />}
                      expanded={expandedId === pick.contestant_id}
                      onToggle={() => toggleExpand(pick.contestant_id)}
                    >
                      <RosterBreakdown perf={perfs.get(pick.contestant_id)} activeFrom={pick.active_from_episode} activeUntil={pick.active_until_episode} doubledByEp={doubledByContestantEp.get(pick.contestant_id) ?? EMPTY_EP_MAP} />
                    </RosterCard>
                  ))}
              </RosterManifest>
            )}
            {swaps.length > 0 && (
              <div className="mt-6">
                <SectionShell title="Swap history" defaultOpen={false}>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {swaps.map(({ out, into }) => (
                      <li key={out.id}>{contestantMap.get(out.contestant_id)?.name ?? '—'} → {into ? contestantMap.get(into.contestant_id)?.name ?? '—' : '?'} <span className="text-gray-500">(episode {(out.active_until_episode ?? 0) + 1})</span></li>
                    ))}
                  </ul>
                </SectionShell>
              </div>
            )}
          </SectionShell>
        </section>

        <div className="space-y-8">
          <SectionShell title="Ballot history" prominent defaultOpen={votes.length > 0}>
            {votes.length === 0 ? <p className="text-sm text-gray-500">No unlocked ballots yet.</p> : (
              <div className="space-y-3">
                {votes.map(({ episode, picks, eliminatedIds }) => (
                  <div key={episode.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="mb-2 font-medium text-gray-700">Episode {episode.episode_number}</p>
                    {picks.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {picks.map((pick) => {
                          const correct = eliminatedIds.has(pick.contestant_id)
                          const doubled = doubles.some((play) => play.episode_id === episode.id && (play.target_contestant_id === null || play.target_contestant_id === pick.contestant_id))
                          return (
                            <span key={pick.id} className={`rounded-md border px-2 py-1 text-sm ${correct ? 'border-jade-300 bg-jade-50 text-jade-800' : 'border-cream-200 bg-white text-gray-500'}`}>
                              {correct ? '✓ ' : ''}{contestantMap.get(pick.contestant_id)?.name ?? '—'}{doubled && <span className="font-semibold text-forest-700"> ×2</span>}
                            </span>
                          )
                        })}
                      </div>
                    ) : <p className="text-sm text-gray-500">No ballot submitted.</p>}
                  </div>
                ))}
              </div>
            )}
          </SectionShell>

          <SectionShell title="Weekly play history" prominent defaultOpen={scoredPlays.length > 0}>
            {hidden ? (
              <p className="text-sm text-gray-500">Weekly plays unlock with the roster.</p>
            ) : scoredPlays.length === 0 ? (
              <p className="text-sm text-gray-500">No weekly plays used yet.</p>
            ) : (
              <ol className="space-y-2">
                {scoredPlays
                  .sort((a, b) => (episodes.find((episode) => episode.id === b.episode_id)?.episode_number ?? 0) - (episodes.find((episode) => episode.id === a.episode_id)?.episode_number ?? 0))
                  .map((play) => {
                    const episode = episodes.find((row) => row.id === play.episode_id)
                    const target = play.target_contestant_id ? contestantMap.get(play.target_contestant_id)?.name : null
                    return (
                      <li key={play.id} className="flex items-start justify-between gap-4 rounded-xl border border-cream-200 bg-white p-3 text-sm">
                        <div><p className="font-medium text-gray-800">{ADV_LABELS[play.advantage_type] ?? play.advantage_type}</p><p className="mt-0.5 text-xs text-gray-500">Episode {episode?.episode_number ?? '—'}{target ? ` · ${target}` : ''}</p></div>
                        <Points value={play.points_earned ?? undefined} />
                      </li>
                    )
                  })}
              </ol>
            )}
          </SectionShell>
        </div>
      </div>

      <SwipeNavBar prev={href(prevP)} next={href(nextP)} prevLabel={prevP?.display_name} nextLabel={nextP?.display_name} />
    </div>
  )
}
