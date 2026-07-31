import { useEffect, useState } from 'react'
import { PageLoader } from '../components/PageLoader'
import { useNavigate, useParams } from 'react-router'
import { api } from '../lib/api'
import { RosterBreakdown } from '../components/RosterBreakdown'
import {
  doubledByContestantEpisode,
  EMPTY_EP_MAP,
  useRosterBreakdown,
} from '../lib/rosterBreakdown'
import { RosterCard } from '../components/RosterCard'
import { SectionShell } from '../components/SectionShell'
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
  const color = value > 0 ? 'text-green-600' : value < 0 ? 'text-red-500' : 'text-gray-400'
  return (
    <span className={`text-xs font-medium ${color}`}>
      {value > 0 ? '+' : ''}
      {value} pts
    </span>
  )
}

const ADVANTAGE_LABEL: Record<string, string> = {
  double_roster_points: 'Double Roster Points',
  double_vote_points: 'Double Vote Points',
}

// Read-only view of another player's roster, reached from Standings (#83),
// plus their votes for scored episodes (#134 — pre-scoring votes stay
// private, enforced server-side).
export function TeamPage() {
  const { seasonId, userId } = useParams()
  const navigate = useNavigate()
  const [roster, setRoster] = useState<RosterPick[]>([])
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [rosterPoints, setRosterPoints] = useState<Map<string, number>>(new Map())
  const [plays, setPlays] = useState<AdvantagePlay[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [votes, setVotes] = useState<EpisodeVotes[]>([])
  const [name, setName] = useState<string>('')
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { expandedId, perfs, toggleExpand } = useRosterBreakdown()

  useEffect(() => {
    if (!seasonId || !userId) return
    async function load() {
      try {
        const [cs, standings, episodes] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${seasonId}/contestants`),
          api.get<StandingEntry[]>(`/seasons/${seasonId}/standings`),
          api.get<Episode[]>(`/seasons/${seasonId}/episodes`),
        ])
        setContestants(cs)
        setEpisodes(episodes)
        setName(standings.find((s) => s.user_id === userId)?.display_name ?? 'Team')
        try {
          setRoster(await api.get<RosterPick[]>(`/seasons/${seasonId}/roster/${userId}`))
          // Same 403-until-lock rule as the roster; roster points only for
          // other players' breakdowns (#160).
          const breakdown = await api.get<ScoringBreakdown>(
            `/seasons/${seasonId}/scoring-breakdown/${userId}`,
          )
          setRosterPoints(new Map(breakdown.roster.map((r) => [r.contestant_id, r.points])))
          setPlays(
            await api
              .get<AdvantagePlay[]>(`/seasons/${seasonId}/advantage-plays/${userId}`)
              .catch(() => []),
          )
        } catch {
          setHidden(true) // 403 until rosters lock
        }

        const scored = episodes
          .filter((e) => e.status === 'scored')
          .sort((a, b) => b.episode_number - a.episode_number)
        setVotes(
          await Promise.all(
            scored.map(async (episode) => {
              const [picks, eliminations] = await Promise.all([
                api
                  .get<EliminationPick[]>(`/episodes/${episode.id}/picks/${userId}`)
                  .catch(() => []),
                api.get<Elimination[]>(`/episodes/${episode.id}/eliminations`),
              ])
              return {
                episode,
                picks,
                eliminatedIds: new Set(eliminations.map((e) => e.contestant_id)),
              }
            }),
          ),
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load team')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [seasonId, userId])

  if (loading) return <PageLoader />
  if (error) return <p className="text-red-600">{error}</p>

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const episodeMap = new Map(episodes.map((e) => [e.id, e]))
  const doubledByContestantEp = doubledByContestantEpisode(plays, episodes)
  const active = roster.filter((r) => r.active_until_episode === null)
  // Original picks share the earliest start episode; later starts are swap-ins.
  const rosterBaseEp = Math.min(...roster.map((r) => r.active_from_episode))
  // Pair each swapped-out pick with its replacement: a swap closes the old
  // row at ep N and opens the new one at N+1 (#155).
  const swaps = roster
    .filter((r) => r.active_until_episode !== null)
    .map((out) => ({
      out,
      into: roster.find(
        (r) => r.active_from_episode === (out.active_until_episode ?? 0) + 1,
      ),
    }))
  // Double Roster Points now folds into the roster rows (#257); other played
  // advantages (e.g. Double Vote Points, which pays elimination points) get
  // their own Play History-style section below (#284). Only scored plays are
  // ever visible here, so there is no owned/in-play state to lock-badge.
  const bonuses = plays.filter(
    (p) =>
      p.points_earned != null &&
      p.points_earned !== 0 &&
      p.advantage_type !== 'double_roster_points',
  )

  return (
    <div>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-ocean-600 hover:text-ocean-800"
      >
        ← Back
      </button>
      <h1 className="font-display text-2xl md:text-3xl tracking-wide text-ocean-800 mt-3 mb-1">{name}</h1>
      <p className="text-sm text-gray-500 mb-6">Roster</p>

      {hidden ? (
        <p className="text-sm text-gray-500">This team is hidden until rosters lock.</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-gray-500">No roster yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {/* Another player's SS flag is only served post-lock, so the solid
              gold outline is always the right state here. */}
          {/* Boots sink to the bottom (#190); stable sort keeps the rest in place. */}
          {[...active]
            .sort(
              (a, b) =>
                Number(contestantMap.get(a.contestant_id)?.eliminated_in_episode != null) -
                Number(contestantMap.get(b.contestant_id)?.eliminated_in_episode != null),
            )
            .map((pick) => (
            <RosterCard
              key={pick.id}
              contestantId={pick.contestant_id}
              contestant={contestantMap.get(pick.contestant_id)}
              isSoleSurvivor={pick.is_sole_survivor}
              swappedInEpisode={
                pick.active_from_episode > rosterBaseEp ? pick.active_from_episode : null
              }
              right={<Points value={rosterPoints.get(pick.contestant_id)} />}
              expanded={expandedId === pick.contestant_id}
              onToggle={() => toggleExpand(pick.contestant_id)}
            >
              <RosterBreakdown
                perf={perfs.get(pick.contestant_id)}
                activeFrom={pick.active_from_episode}
                activeUntil={pick.active_until_episode}
                doubledByEp={doubledByContestantEp.get(pick.contestant_id) ?? EMPTY_EP_MAP}
              />
            </RosterCard>
          ))}
        </ul>
      )}

      {/* Same shape as the Advantages page Play History (#273/#284): grouped
          into its own collapsed section instead of sitting in the roster list. */}
      {bonuses.length > 0 && (
        <div className="mt-6">
          <SectionShell
            title="Advantage Plays"
            defaultOpen={false}
            right={<span className="text-xs text-gray-400">{bonuses.length}</span>}
          >
            <ul className="space-y-2">
              {bonuses.map((p) => {
                const epNumber = episodeMap.get(p.episode_id ?? '')?.episode_number
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm"
                  >
                    <span className="text-gray-700">
                      {ADVANTAGE_LABEL[p.advantage_type] ?? p.advantage_type}
                      {p.target_contestant_id && (
                        <span className="text-gray-400">
                          {' '}
                          → {contestantMap.get(p.target_contestant_id)?.name ?? '—'}
                        </span>
                      )}
                      {epNumber != null && (
                        <span className="text-gray-400"> · Episode {epNumber}</span>
                      )}
                    </span>
                    <span className="shrink-0">
                      <Points value={p.points_earned ?? undefined} />
                    </span>
                  </li>
                )
              })}
            </ul>
          </SectionShell>
        </div>
      )}

      {swaps.length > 0 && (
        <div className="mt-6">
          <SectionShell title="Swaps" defaultOpen={false}>
            <ul className="space-y-1 text-sm text-gray-600">
              {swaps.map(({ out, into }) => (
                <li key={out.id}>
                  {contestantMap.get(out.contestant_id)?.name ?? '—'}
                  {' → '}
                  {into ? (contestantMap.get(into.contestant_id)?.name ?? '—') : '?'}
                  <span className="text-gray-400">
                    {' '}
                    (episode {(out.active_until_episode ?? 0) + 1})
                  </span>
                </li>
              ))}
            </ul>
          </SectionShell>
        </div>
      )}

      {votes.length > 0 && (
        <div className="mt-10">
          {/* Collapsed by default with flat rows inside, matching Past Episodes
              on My Votes (#272/#280). */}
          <SectionShell
            title="Previous Votes"
            defaultOpen={false}
            right={<span className="text-xs text-gray-400">{votes.length}</span>}
          >
            <div className="space-y-3">
              {votes.map(({ episode, picks, eliminatedIds }) => (
                <div
                  key={episode.id}
                  className="p-4 bg-gray-50 border border-gray-100 rounded-xl"
                >
                  <p className="font-medium text-gray-700 mb-2">
                    Episode {episode.episode_number}
                  </p>
                  {picks.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {picks.map((p) => {
                        const correct = eliminatedIds.has(p.contestant_id)
                        // Correct gets the green + check; incorrect stays
                        // neutral — most votes miss, no red walls (#135).
                        return (
                          <span
                            key={p.id}
                            className={`text-sm px-2 py-1 border rounded-md ${
                              correct
                                ? 'bg-green-50 border-green-300 text-green-800'
                                : 'bg-white border-sand-200 text-gray-500'
                            }`}
                          >
                            {correct && '✓ '}
                            {contestantMap.get(p.contestant_id)?.name ?? '—'}
                          </span>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No votes submitted</p>
                  )}
                </div>
              ))}
            </div>
          </SectionShell>
        </div>
      )}
    </div>
  )
}
