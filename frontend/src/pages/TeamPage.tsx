import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CorrectVote } from '../components/CorrectVote'
import { DoubleBadge } from '../components/DoubleBadge'
import { FinaleBracket, type FinaleActuals } from '../components/FinaleBracket'
import { HeaderPager } from '../components/HeaderPager'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { RosterBreakdown } from '../components/RosterBreakdown'
import { RosterCard, RosterManifest } from '../components/RosterCard'
import { SectionShell } from '../components/SectionShell'
import { displayName } from '../lib/cast'
import { episodeClosed } from '../lib/episodes'
import { pathQuery } from '../lib/queries'
import { doubledByContestantEpisode, EMPTY_EP_MAP, useRosterBreakdown } from '../lib/rosterBreakdown'
import { rankStandings } from '../lib/standings'
import { useSwipeNav } from '../lib/swipe'
import type {
  Season,
  AdvantagePlay,
  Contestant,
  Elimination,
  EliminationPick,
  Episode,
  FinalePrediction,
  RosterPick,
  ScoringBreakdown,
  StandingEntry,
} from '../types'

/** The five reads a team page makes for one player. Named once so the page
 *  and the swipe prefetch below can't drift apart (#814). */
function teamPaths(leagueSeasonId: string, userId: string) {
  return {
    roster: `/league-seasons/${leagueSeasonId}/roster/${userId}`,
    breakdown: `/league-seasons/${leagueSeasonId}/scoring-breakdown/${userId}`,
    plays: `/league-seasons/${leagueSeasonId}/advantage-plays/${userId}`,
    picks: `/league-seasons/${leagueSeasonId}/picks/${userId}`,
    finale: `/league-seasons/${leagueSeasonId}/finale-predictions/${userId}`,
  }
}

function Points({ value }: { value: number | undefined }) {
  if (value == null) return null
  const color = value > 0 ? 'text-jade-700' : value < 0 ? 'text-terracotta-600' : 'text-paper-ink-faded'
  return <span className={`text-xs font-medium ${color}`}>{value > 0 ? '+' : ''}{value} pts</span>
}

type SectionKey = 'tribe' | 'finale' | 'ballot' | 'swapped'
const ALL_CLOSED: Record<SectionKey, boolean> = { tribe: false, finale: false, ballot: false, swapped: false }

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

export function TeamPage() {
  const { leagueSeasonId, userId } = useParams()
  const queryClient = useQueryClient()
  // The page runs its own sections rather than letting them remember per
  // title, which would share state with My Season's Tribe and Ballot (#646).
  // Tribe alone starts open; the rest are a tap or Expand all away.
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ ...ALL_CLOSED, tribe: true })
  const { expandedId, perfs, toggleExpand } = useRosterBreakdown()
  // Whether a team has ever been drawn here; see the loader gate below.
  const drawn = useRef(false)

  const seasonQ = useQuery(pathQuery<Season>(leagueSeasonId ? `/league-seasons/${leagueSeasonId}` : null))
  const showId = seasonQ.data?.season_id
  const contestantsQ = useQuery(pathQuery<Contestant[]>(showId ? `/seasons/${showId}/contestants` : null))
  const episodesQ = useQuery(pathQuery<Episode[]>(showId ? `/seasons/${showId}/episodes` : null))
  // Two requests for the whole ledger, not two per episode (#803). Both answer
  // for locked episodes only, which is all the Ballot section shows.
  const eliminationsQ = useQuery(pathQuery<Elimination[]>(showId ? `/seasons/${showId}/eliminations` : null))
  const standingsQ = useQuery(pathQuery<StandingEntry[]>(leagueSeasonId ? `/league-seasons/${leagueSeasonId}/standings` : null))
  const paths = leagueSeasonId && userId ? teamPaths(leagueSeasonId, userId) : null
  const rosterQ = useQuery(pathQuery<RosterPick[]>(paths?.roster ?? null))
  const breakdownQ = useQuery(pathQuery<ScoringBreakdown>(paths?.breakdown ?? null))
  const playsQ = useQuery(pathQuery<AdvantagePlay[]>(paths?.plays ?? null))
  // 403 until this player's picks lock; the finale bracket is also a 404 when
  // they never filed one (they may only have the Sole Survivor designation).
  const picksQ = useQuery(pathQuery<Record<string, EliminationPick[]>>(paths?.picks ?? null))
  const bracketQ = useQuery(pathQuery<FinalePrediction>(paths?.finale ?? null))

  // Everything the page used to await before it drew. A refusal counts as
  // answered — that is the `hidden` state below, not a failure.
  const queries = [seasonQ, contestantsQ, episodesQ, eliminationsQ, standingsQ, rosterQ, breakdownQ, playsQ, picksQ, bracketQ]
  const loading = queries.some((q) => q.isPending)
  // Only the season-wide reads can fail the page; the per-player five are
  // allowed to refuse, exactly as their `.catch()`es used to let them.
  const error = seasonQ.error ?? contestantsQ.error ?? episodesQ.error ?? standingsQ.error
  const hidden = rosterQ.isError || breakdownQ.isError

  const siblings = standingsQ.data ?? []
  const player = siblings.find((standing) => standing.user_id === userId) ?? null
  const contestants = contestantsQ.data ?? []
  const episodes = episodesQ.data ?? []
  const roster = hidden ? [] : rosterQ.data ?? []
  const plays = hidden ? [] : playsQ.data ?? []
  const rosterPoints = new Map((breakdownQ.data?.roster ?? []).map((row) => [row.contestant_id, row.points]))
  // `${episode_id}:${contestant_id}` -> base points of a correct vote.
  const pickPoints = new Map(
    (breakdownQ.data?.picks ?? []).map((row) => [`${row.episode_id}:${row.contestant_id}`, row.points]),
  )
  const ssBonus = breakdownQ.data?.sole_survivor_bonus ?? 0
  const bracket = bracketQ.data ?? null

  // Each player starts at Tribe open, as the old per-player load left it.
  useEffect(() => setOpen({ ...ALL_CLOSED, tribe: true }), [userId])

  const idx = siblings.findIndex((standing) => standing.user_id === userId)
  const prevP = idx > 0 ? siblings[idx - 1] : undefined
  const nextP = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : undefined
  const href = (standing?: StandingEntry) => standing && `/league-seasons/${leagueSeasonId}/team/${standing.user_id}`
  useSwipeNav(href(prevP), href(nextP))

  // The teams either side are read in the background once this one is on
  // screen, so swiping to them is a render rather than three waves of requests
  // (#814). Their answers land in the query cache under the same keys the
  // sibling page will ask for; the season-wide reads are already there.
  const prevId = prevP?.user_id
  const nextId = nextP?.user_id
  useEffect(() => {
    if (!leagueSeasonId || loading) return
    for (const sibling of [prevId, nextId]) {
      if (!sibling) continue
      for (const path of Object.values(teamPaths(leagueSeasonId, sibling))) {
        void queryClient.prefetchQuery(pathQuery(path))
      }
    }
  }, [queryClient, leagueSeasonId, prevId, nextId, loading])

  // Keep the current team on screen while swiping to a sibling (#451) — only the
  // first load gets the full torch loader, so stepping through doesn't strobe.
  // A ref rather than `!player`: the standings this page finds the player in are
  // usually already cached from the page you tapped through from, which would
  // otherwise draw an empty Tribe and Ballot while the team's own reads were out.
  if (loading && !drawn.current) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load this team">{error.message}</Notice>
  if (!player) return <Notice title="Player not found"><Link className="text-forest-700 underline" to="/standings">Return to standings</Link></Notice>
  drawn.current = true

  const episodeRows = episodes
    .filter(
      (e) => episodeClosed(e) && !e.is_finale && e.episode_number >= (seasonQ.data?.roster_lock_episode ?? 1),
    )
    .sort((a, b) => b.episode_number - a.episode_number)
  const outByEpisode = new Map<string, Set<string>>()
  for (const row of eliminationsQ.data ?? []) {
    const ids = outByEpisode.get(row.episode_id) ?? new Set<string>()
    ids.add(row.contestant_id)
    outByEpisode.set(row.episode_id, ids)
  }
  // The finale is a bracket, not elimination votes — it gets its own Finale
  // section, so keep it out of the weekly Ballot ledger. Premieres before roster
  // lock accept no votes, so they aren't "No votes" rows (#82).
  const votes = episodeRows.map((episode) => ({
    episode,
    picks: picksQ.data?.[episode.id] ?? [],
    eliminatedIds: outByEpisode.get(episode.id) ?? new Set<string>(),
  }))

  const contestantMap = new Map(contestants.map((contestant) => [contestant.id, contestant]))
  const episodeTitles = new Map(episodes.map((episode) => [episode.episode_number, episode.title]))
  const doubledByContestantEp = doubledByContestantEpisode(plays, episodes)
  const active = roster.filter((pick) => pick.active_until_episode === null)
  // Most recent swap on top, the first swap at the bottom.
  const swappedOut = roster
    .filter((pick) => pick.active_until_episode !== null)
    .sort((a, b) => (b.active_until_episode ?? 0) - (a.active_until_episode ?? 0))
  const rosterBaseEp = roster.length > 0 ? Math.min(...roster.map((pick) => pick.active_from_episode)) : 0
  // A swap's penalty books only once the episode it happened in has closed
  // (matches My Season; penalties are 0 under the token-cost model).
  const penaltyBooked = (pick: RosterPick) =>
    episodes.some((e) => e.episode_number === (pick.active_until_episode ?? 0) + 1 && episodeClosed(e))
  const doubles = plays.filter((play) => play.advantage_type === 'double_vote_points')
  const ranked = rankStandings(siblings).find(({ entry }) => entry.user_id === userId)
  const finaleScored = episodes.some((episode) => episode.is_finale && episode.status === 'scored')
  // Swapped-out castaways is a footnote inside Tribe: expand-all opens it,
  // but its being closed doesn't make the page read as collapsed.
  const sections: SectionKey[] = ['tribe', 'ballot', ...(finaleScored ? ['finale' as const] : [])]
  const allOpen = sections.every((key) => open[key])
  const toggleSection = (key: SectionKey) => () => setOpen((o) => ({ ...o, [key]: !o[key] }))

  // The finale isn't an elimination vote — a player's call is their Final 4/3/
  // winner bracket if they filed one, otherwise their Sole Survivor winner
  // designation (which shows as a lone winner apex). It renders as a pyramid in
  // its own Finale section, marked correct/incorrect off the actual placements.
  const crown = active.find((pick) => pick.is_sole_survivor)
  const finaleActuals: FinaleActuals = {
    finalFour: new Set(contestants.filter((c) => c.placement != null && c.placement <= 4).map((c) => c.id)),
    finalThree: new Set(contestants.filter((c) => c.placement != null && c.placement <= 3).map((c) => c.id)),
    winner: contestants.find((c) => c.placement === 1)?.id ?? null,
  }
  const finaleBallot = bracket
    ? {
        finalFour: bracket.final_four_contestant_ids,
        finalThree: bracket.final_three_contestant_ids,
        winner: bracket.winner_contestant_id ?? '',
      }
    : crown
      ? { finalFour: [] as string[], finalThree: [] as string[], winner: crown.contestant_id }
      : null

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
        // Possessive against the nav's "My Season": the one cue that says whose
        // record this is (#646).
        title={`${player.display_name}'s Season`}
        description={<span className="text-forest-900"><strong className="text-lg">{player.total_points}</strong> season points{finaleScored && <span className="text-gray-500"> · Finale +{player.finale_points}</span>}</span>}
        actions={<HeaderPager prev={href(prevP)} next={href(nextP)} prevLabel={prevP?.display_name} nextLabel={nextP?.display_name} />}
      />

      {/* One column at every width, in My Season's order (#646): this is the
          same record read for someone else, not a dashboard beside it. */}
      <div className="mt-8 flex justify-end">
        <button
          onClick={() => setOpen(allOpen ? ALL_CLOSED : { tribe: true, finale: true, ballot: true, swapped: true })}
          className="text-[11px] font-semibold uppercase tracking-wide text-forest-700 underline underline-offset-2"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="mt-2 space-y-8">
        <section>
          <SectionShell title="Tribe" prominent open={open.tribe} onToggle={toggleSection('tribe')} right={<SectionPoints value={player.roster_points} />}>
            {hidden ? (
              <Notice title="Team details are still private">Tribe and weekly-play choices unlock when tribes lock.</Notice>
            ) : active.length === 0 ? (
              <Notice title="No tribe submitted">This player does not have an active tribe yet.</Notice>
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
                      showSoleSurvivorHalo
                      soleSurvivorBonus={pick.is_sole_survivor ? ssBonus : 0}
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
            {swappedOut.length > 0 && (
              <div className="mt-6">
                {/* Swapped-out castaways read exactly like My Season's: a real
                    roster card each — the points they banked while held, the
                    episodes they were yours for, and a tap into their scoped
                    per-episode breakdown. Not the flat out→into ledger. */}
                <SectionShell title="Swapped-out castaways" open={open.swapped} onToggle={toggleSection('swapped')}>
                  <RosterManifest>
                    {swappedOut.map((pick) => (
                      <RosterCard
                        key={pick.id}
                        contestantId={pick.contestant_id}
                        contestant={contestantMap.get(pick.contestant_id)}
                        right={
                          <span className="flex items-center gap-2 text-xs">
                            <Points value={rosterPoints.get(pick.contestant_id)} />
                            <span className="text-paper-ink-faded">ep {pick.active_from_episode}–{pick.active_until_episode}</span>
                          </span>
                        }
                        bioLink={false}
                        expanded={expandedId === pick.contestant_id}
                        onToggle={() => toggleExpand(pick.contestant_id)}
                      >
                        <RosterBreakdown
                          perf={perfs.get(pick.contestant_id)}
                          activeFrom={pick.active_from_episode}
                          activeUntil={pick.active_until_episode}
                          doubledByEp={doubledByContestantEp.get(pick.contestant_id) ?? EMPTY_EP_MAP}
                          episodeTitles={episodeTitles}
                          swapPenalty={penaltyBooked(pick) ? pick.swap_penalty_points : 0}
                        />
                      </RosterCard>
                    ))}
                  </RosterManifest>
                </SectionShell>
              </div>
            )}
          </SectionShell>
        </section>

        {finaleScored && (
          <SectionShell title="Finale" prominent open={open.finale} onToggle={toggleSection('finale')}>
            {finaleBallot ? (
              <div className="flex justify-center py-2">
                <FinaleBracket
                  finalFour={finaleBallot.finalFour}
                  finalThree={finaleBallot.finalThree}
                  winner={finaleBallot.winner}
                  byId={contestantMap}
                  actuals={finaleActuals}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-500">No finale ballot submitted.</p>
            )}
          </SectionShell>
        )}

          <SectionShell title="Ballot" prominent open={open.ballot} onToggle={toggleSection('ballot')} right={<SectionPoints value={player.elimination_points} />}>
            {votes.length === 0 ? <p className="text-sm text-gray-500">No unlocked ballots yet.</p> : (
              // One ledger row per episode, matching the My Season History sheet:
              // "Ep N", the votes (correct ones pilled), a single idol if the
              // ballot was doubled. The episode title is dropped — the week is
              // all this row has to say.
              <div className="overflow-hidden rounded-xl border border-paper-edge record-paper">
                {votes.map(({ episode, picks, eliminatedIds }) => {
                  const ballotDouble = doubles.find((play) => play.episode_id === episode.id)
                  // Power Vote names one pick (#673), and the idol sits on that
                  // vote; a #303-era play has no target and doubled the whole
                  // ballot, so its idol sits by the episode instead.
                  const x2 = ballotDouble?.target_contestant_id ?? null
                  return (
                    <div key={episode.id} className="flex items-center gap-2 border-b border-paper-line px-3.5 py-2 last:border-b-0">
                      <span className="shrink-0 text-sm font-medium text-paper-ink">
                        Ep {episode.episode_number}
                      </span>
                      {ballotDouble && !x2 && <DoubleBadge size={18} title="Power Vote this episode" />}
                      <span
                        role="group"
                        aria-label="Votes"
                        tabIndex={0}
                        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
                      >
                        {picks.length === 0 ? (
                          <span className="text-sm text-paper-ink-faded">No votes</span>
                        ) : (
                          picks.map((pick) => {
                            const nameC = contestantMap.get(pick.contestant_id)
                            const name = nameC ? displayName(nameC) : '—'
                            const mark = pick.contestant_id === x2 ? <DoubleBadge size={18} title="Power Vote" /> : null
                            // Pick results are base values (#136); the Power Vote's name shows what it paid.
                            const base = pickPoints.get(`${episode.id}:${pick.contestant_id}`) ?? 0
                            const points = base + (mark ? (ballotDouble?.points_earned ?? 0) : 0)
                            return eliminatedIds.has(pick.contestant_id) ? (
                              <CorrectVote key={pick.id} name={name} points={points > 0 ? points : undefined} icon={mark} />
                            ) : (
                              <span key={pick.id} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-paper-line bg-black/[.03] px-2 py-0.5 text-sm text-paper-ink-faded">
                                {mark}{name}
                              </span>
                            )
                          })
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionShell>
      </div>
    </div>
  )
}
