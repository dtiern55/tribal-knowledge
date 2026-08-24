import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { EpisodeLabel } from '../components/EpisodeLabel'
import { CorrectVote } from '../components/CorrectVote'
import { HeaderPager } from '../components/HeaderPager'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { RosterBreakdown } from '../components/RosterBreakdown'
import { RosterCard, RosterManifest } from '../components/RosterCard'
import { SectionShell } from '../components/SectionShell'
import { ADV_LABELS } from '../lib/advantages'
import { api } from '../lib/api'
import { displayName } from '../lib/cast'
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
  const color = value > 0 ? 'text-jade-700' : value < 0 ? 'text-terracotta-600' : 'text-paper-ink-faded'
  return <span className={`text-xs font-medium ${color}`}>{value > 0 ? '+' : ''}{value} pts</span>
}

// The section's contribution to the season total, shown on the section header
// so the breakdown lives with the detail instead of in a separate tile row.
// Roster + Ballot (+ Finale) are the additive buckets that make up the total.
function SectionPoints({ value }: { value: number }) {
  return (
    <span className="ml-auto flex items-baseline gap-1">
      <strong className="font-display text-lg tabular-nums text-forest-800">{value}</strong>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">pts</span>
    </span>
  )
}

// Advantage bonus is a *subset* of the roster/ballot points, not a fourth
// bucket. Shown in the same face as the Roster/Ballot totals so it doesn't clash,
// but muted and labelled "included" so it plainly reads as already inside the
// season score rather than a number that adds on top of it.
function AdvantageEarned({ value }: { value: number }) {
  if (value === 0) return null
  return (
    <span className="ml-auto flex items-baseline gap-1.5">
      <strong className="font-display text-lg tabular-nums text-gray-500">
        {value < 0 ? `−${Math.abs(value)}` : value}
      </strong>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">pts&nbsp;included</span>
    </span>
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

  // Keep the current team on screen while swiping to a sibling (#451) — only the
  // first load gets the full torch loader, so stepping through doesn't strobe.
  if (loading && !player) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load this team">{error}</Notice>
  if (!player) return <Notice title="Player not found"><Link className="text-forest-700 underline" to="/standings">Return to standings</Link></Notice>

  const contestantMap = new Map(contestants.map((contestant) => [contestant.id, contestant]))
  const episodeTitles = new Map(episodes.map((episode) => [episode.episode_number, episode.title]))
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
    <div aria-busy={loading} className={`transition-opacity duration-150 ${loading ? 'opacity-60' : ''}`}>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Link to="/standings" className="inline-flex items-center gap-1 hover:underline"><span aria-hidden>‹</span> Standings</Link>
            {ranked && (
              <>
                <span className="text-gray-400" aria-hidden>/</span>
                <span className="text-gray-500">{ranked.tied ? `Tied #${ranked.rank}` : `Rank #${ranked.rank}`}</span>
              </>
            )}
          </span>
        }
        title={player.display_name}
        description={<span className="text-forest-900"><strong className="text-lg">{player.total_points}</strong> season points{finaleScored && <span className="text-gray-500"> · Finale +{player.finale_points}</span>}</span>}
        actions={<HeaderPager prev={href(prevP)} next={href(nextP)} prevLabel={prevP?.display_name} nextLabel={nextP?.display_name} />}
      />

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,.85fr)]">
        <section>
          <SectionShell title="Roster" prominent right={<SectionPoints value={player.roster_points} />}>
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
                      bioLink={false}
                      expanded={expandedId === pick.contestant_id}
                      onToggle={() => toggleExpand(pick.contestant_id)}
                    >
                      <RosterBreakdown perf={perfs.get(pick.contestant_id)} activeFrom={pick.active_from_episode} activeUntil={pick.active_until_episode} doubledByEp={doubledByContestantEp.get(pick.contestant_id) ?? EMPTY_EP_MAP} episodeTitles={episodeTitles} />
                    </RosterCard>
                  ))}
              </RosterManifest>
            )}
            {swaps.length > 0 && (
              <div className="mt-6">
                <SectionShell title="Swap history" defaultOpen={false}>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {swaps.map(({ out, into }) => {
                      const outC = contestantMap.get(out.contestant_id)
                      const intoC = into ? contestantMap.get(into.contestant_id) : undefined
                      return (
                        <li key={out.id}>{outC ? displayName(outC) : '—'} → {into ? (intoC ? displayName(intoC) : '—') : '?'} <span className="text-gray-500">(episode {(out.active_until_episode ?? 0) + 1})</span></li>
                      )
                    })}
                  </ul>
                </SectionShell>
              </div>
            )}
          </SectionShell>
        </section>

        <div className="space-y-8">
          <SectionShell title="Ballot" prominent defaultOpen={votes.length > 0} right={<SectionPoints value={player.elimination_points} />}>
            {votes.length === 0 ? <p className="text-sm text-gray-500">No unlocked ballots yet.</p> : (
              <div className="space-y-3">
                {votes.map(({ episode, picks, eliminatedIds }) => (
                  <div key={episode.id} className="rounded-xl border border-paper-edge record-paper p-4">
                    <EpisodeLabel
                      episode={episode}
                      className="mb-2 font-medium text-paper-ink"
                      titleClassName="font-normal text-paper-ink-faded"
                    />
                    {picks.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {picks.map((pick) => {
                          const correct = eliminatedIds.has(pick.contestant_id)
                          const doubled = doubles.some((play) => play.episode_id === episode.id && (play.target_contestant_id === null || play.target_contestant_id === pick.contestant_id))
                          const nameC = contestantMap.get(pick.contestant_id)
                          const name = nameC ? displayName(nameC) : '—'
                          const x2 = doubled ? <span className="font-semibold text-terracotta-700"> ×2</span> : null
                          if (correct) return <CorrectVote key={pick.id} name={name} trailing={x2} />
                          return (
                            <span key={pick.id} className="rounded-md border border-paper-edge bg-black/[.03] px-2 py-1 text-sm text-paper-ink-faded">
                              {name}{x2}
                            </span>
                          )
                        })}
                      </div>
                    ) : <p className="text-sm text-paper-ink-faded">No ballot submitted.</p>}
                  </div>
                ))}
              </div>
            )}
          </SectionShell>

          <SectionShell title="Advantages" prominent defaultOpen={scoredPlays.length > 0} right={<AdvantageEarned value={weeklyBonus} />}>
            {hidden ? (
              <p className="text-sm text-gray-500">Advantages unlock with the roster.</p>
            ) : scoredPlays.length === 0 ? (
              <p className="text-sm text-gray-500">No advantages used yet.</p>
            ) : (
              <ol className="space-y-2">
                {scoredPlays
                  .sort((a, b) => (episodes.find((episode) => episode.id === b.episode_id)?.episode_number ?? 0) - (episodes.find((episode) => episode.id === a.episode_id)?.episode_number ?? 0))
                  .map((play) => {
                    const episode = episodes.find((row) => row.id === play.episode_id)
                    const target = play.target_contestant_id ? contestantMap.get(play.target_contestant_id)?.name : null
                    return (
                      <li key={play.id} className="flex items-start justify-between gap-4 rounded-xl border border-paper-edge record-paper p-3 text-sm">
                        <div><p className="font-medium text-paper-ink">{ADV_LABELS[play.advantage_type] ?? play.advantage_type}</p><p className="mt-0.5 text-xs text-paper-ink-faded">Episode {episode?.episode_number ?? '—'}{target ? ` · ${target}` : ''}</p></div>
                        <Points value={play.points_earned ?? undefined} />
                      </li>
                    )
                  })}
              </ol>
            )}
          </SectionShell>
        </div>
      </div>
    </div>
  )
}
