import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../lib/api'
import { ContestantAvatar } from '../components/ContestantAvatar'
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
  const [votes, setVotes] = useState<EpisodeVotes[]>([])
  const [name, setName] = useState<string>('')
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
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
  const bonuses = plays.filter(
    (p) => p.points_earned != null && p.points_earned !== 0,
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
        <ul className="space-y-2">
          {active.map((pick) => {
            const c = contestantMap.get(pick.contestant_id)
            return (
              <li
                key={pick.id}
                className="flex items-center justify-between p-3 bg-white border border-sand-200 rounded-lg"
              >
                <Link
                  to={`/contestants/${pick.contestant_id}`}
                  className="flex items-center gap-2 font-medium text-gray-900 hover:text-ocean-700"
                >
                  <ContestantAvatar name={c?.name ?? '—'} imageUrl={c?.image_url ?? null} />
                  {c?.name ?? '—'}
                  {pick.is_sole_survivor && (
                    <span
                      className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold"
                      title="Sole Survivor — finale points count double"
                    >
                      SS
                    </span>
                  )}
                  {pick.active_from_episode > rosterBaseEp && (
                    <span
                      className="text-[10px] uppercase tracking-wide bg-ocean-50 text-ocean-600 px-1.5 py-0.5 rounded"
                      title={`Swapped in from episode ${pick.active_from_episode}`}
                    >
                      ⇄ ep {pick.active_from_episode}
                    </span>
                  )}
                  {c?.eliminated_in_episode != null && (
                    <span className="text-[10px] uppercase tracking-wide bg-red-50 text-red-600 px-1.5 py-0.5 rounded">
                      Out ep {c.eliminated_in_episode}
                    </span>
                  )}
                </Link>
                <Points value={rosterPoints.get(pick.contestant_id)} />
              </li>
            )
          })}
          {/* Played doubles earn separate line items so contestant rows show
              BASE points, mirroring the owner's My Season view (#136/#160). */}
          {bonuses.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between p-3 bg-ocean-50 border border-ocean-100 rounded-lg text-sm"
            >
              <span className="text-ocean-800">
                {ADVANTAGE_LABEL[p.advantage_type] ?? p.advantage_type} —{' '}
                <span className="font-medium">
                  {contestantMap.get(p.target_contestant_id ?? '')?.name ?? '—'}
                </span>
              </span>
              <Points value={p.points_earned ?? undefined} />
            </li>
          ))}
        </ul>
      )}

      {swaps.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-l-2 border-ember-500 pl-2 mb-2">
            Swaps
          </h2>
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
        </div>
      )}

      {votes.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-l-2 border-ember-500 pl-2 mb-3">
            Previous Votes
          </h2>
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
        </div>
      )}
    </div>
  )
}
