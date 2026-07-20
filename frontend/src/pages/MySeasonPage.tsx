import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, getActiveSeason } from '../lib/api'
import { ContestantAvatar } from '../components/ContestantAvatar'
import { LockBadge } from '../components/LockBadge'
import { advantagesLocked, isEpisodeOpen, ssDesignationOpen, ssLockEpisodeNumber, swapsLocked } from '../lib/episodes'
import { RosterCard } from '../components/RosterCard'
import { formatCentral } from '../lib/time'
import { useAuth } from '../auth/useAuth'
import type {
  AdvantagePlay,
  Contestant,
  EliminationPick,
  Episode,
  FinalePrediction,
  PickResult,
  RosterPick,
  ScoringBreakdown,
  Season,
  StandingEntry,
  TokenLedgerEntry,
  WinnerPick,
} from '../types'

export function MySeasonPage() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [season, setSeason] = useState<Season | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [standing, setStanding] = useState<StandingEntry | null>(null)
  const [breakdown, setBreakdown] = useState<ScoringBreakdown>({ roster: [], picks: [] })
  const [plays, setPlays] = useState<AdvantagePlay[]>([])
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const active = await getActiveSeason()
        if (!active) {
          setLoading(false)
          return
        }
        setSeason(active)

        const [cs, eps, standings, bd, ownPlays, bal] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
          api.get<StandingEntry[]>(`/seasons/${active.id}/standings`),
          api.get<ScoringBreakdown>(`/seasons/${active.id}/scoring-breakdown/${userId}`),
          api.get<AdvantagePlay[]>(`/seasons/${active.id}/advantage-plays/${userId}`),
          api
            .get<{ balance: number }>(`/seasons/${active.id}/tokens/${userId}`)
            .then((t) => t.balance)
            .catch(() => null),
        ])
        setContestants(cs)
        setEpisodes(eps)
        setStanding(standings.find((s) => s.user_id === userId) ?? null)
        setBreakdown(bd)
        setPlays(ownPlays)
        setBalance(bal)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!season || !userId) return <p className="text-gray-500">No active season.</p>

  const rosterPoints = new Map(breakdown.roster.map((r) => [r.contestant_id, r.points]))
  const pickResults = new Map(
    breakdown.picks.map((p) => [`${p.episode_id}:${p.contestant_id}`, p]),
  )

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl md:text-3xl tracking-wide text-ocean-800 mb-1">{season.name}</h1>
        <p className="text-sm text-gray-500">My Tribe</p>
      </div>

      <PointsHeader standing={standing} season={season} />
      <RosterSection
        season={season}
        contestants={contestants}
        episodes={episodes}
        userId={userId}
        rosterPoints={rosterPoints}
        plays={plays}
        setPlays={setPlays}
      />
      <PicksSection
        season={season}
        contestants={contestants}
        episodes={episodes}
        userId={userId}
        plays={plays}
        setPlays={setPlays}
        pickResults={pickResults}
      />
      {season.winner_mode === 'classic' ? (
        <WinnerSection season={season} contestants={contestants} episodes={episodes} userId={userId} />
      ) : (
        <SoleSurvivorSection season={season} contestants={contestants} episodes={episodes} userId={userId} />
      )}
      <TokensSection
        balance={balance}
        plays={plays}
        contestants={contestants}
        episodes={episodes}
        seasonId={season.id}
        userId={userId}
      />
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-l-2 border-ember-500 pl-2 mb-3">
      {children}
    </h2>
  )
}

// ─── Points header ──────────────────────────────────────────────────────────

function PointsHeader({
  standing,
  season,
}: {
  standing: StandingEntry | null
  season: Season
}) {
  const [expanded, setExpanded] = useState(false)
  const total = standing?.total_points ?? 0

  const components = [
    { label: 'Roster', value: standing?.roster_points ?? 0 },
    { label: 'Eliminations', value: standing?.elimination_points ?? 0 },
    // ss-mode seasons have no winner-pick component — the Sole Survivor
    // double lands inside roster points instead (#164).
    ...(season.winner_mode === 'classic'
      ? [
          {
            label: 'Winner',
            value: standing?.winner_points ?? 0,
            note: season.winner_lock_episode
              ? `locks ep ${season.winner_lock_episode}`
              : undefined,
          },
        ]
      : []),
    { label: 'Finale', value: standing?.finale_points ?? 0 },
  ]

  return (
    <div className="p-5 bg-white border border-sand-200 rounded-xl">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-l-2 border-ember-500 pl-2">
            My Points
          </p>
          <p className="text-4xl font-bold text-gray-900">{total}</p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-sm text-ocean-600 hover:text-ocean-800 font-medium"
        >
          {expanded ? 'Hide breakdown' : 'Show breakdown'}
        </button>
      </div>
      {expanded && (
        <ul className="mt-4 space-y-1 border-t border-gray-100 pt-3">
          {components.map((c) => (
            <li key={c.label} className="flex justify-between text-sm">
              <span className="text-gray-600">
                {c.label}
                {c.note && <span className="text-gray-400"> · {c.note}</span>}
              </span>
              <span className="font-medium text-gray-900">{c.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Roster section ─────────────────────────────────────────────────────────

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

function RosterSection({
  season,
  contestants,
  episodes,
  userId,
  rosterPoints,
  plays,
  setPlays,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
  rosterPoints: Map<string, number>
  plays: AdvantagePlay[]
  setPlays: React.Dispatch<React.SetStateAction<AdvantagePlay[]>>
}) {
  const [roster, setRoster] = useState<RosterPick[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [swapOld, setSwapOld] = useState('')
  const [swapNew, setSwapNew] = useState('')
  const [swapping, setSwapping] = useState(false)
  const [swapError, setSwapError] = useState<string | null>(null)

  // Double Roster Points, playable inline here as well as on Advantages (#81).
  const [dblTarget, setDblTarget] = useState('')
  const [advBusy, setAdvBusy] = useState(false)
  const [advError, setAdvError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<RosterPick[]>(`/seasons/${season.id}/roster/${userId}`)
      .then((picks) => {
        setRoster(picks)
        // Seed the picker from the current active roster so pre-lock edits
        // start from what you already have (issue #84 free rearranging).
        const active = picks.filter((p) => p.active_until_episode === null)
        if (active.length) setSelected(new Set(active.map((p) => p.contestant_id)))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load roster'))
  }, [season.id, userId])

  const lockEpisode =
    season.roster_lock_episode != null
      ? episodes.find((e) => e.episode_number === season.roster_lock_episode)
      : undefined
  const windowOpen =
    season.roster_lock_episode != null &&
    season.status !== 'completed' &&
    (lockEpisode == null ||
      (lockEpisode.status !== 'scored' && new Date(lockEpisode.picks_lock_at) > new Date()))

  const hasRoster = roster.length > 0
  const activeRoster = roster.filter((r) => r.active_until_episode === null)
  // Original picks all start at the roster lock episode; anything later
  // arrived via swap (#162 — comparing against 1 badged everyone when the
  // lock episode was > 1).
  const rosterBaseEp = Math.min(...roster.map((r) => r.active_from_episode))
  const swappedRoster = roster.filter((r) => r.active_until_episode !== null)
  const contestantMap = new Map(contestants.map((c) => [c.id, c]))

  const upcomingEpisodes = episodes.filter(
    (e) => e.status !== 'scored' && new Date(e.picks_lock_at) > new Date(),
  )
  const rosterContestantIds = new Set(roster.map((r) => r.contestant_id))
  const swapCandidates = contestants.filter(
    (c) => !rosterContestantIds.has(c.id) && c.eliminated_in_episode == null,
  )

  // Light gold SS outline while the designation window is open, solid once
  // locked (#190).
  const ssOpen = ssDesignationOpen(season, episodes)

  // Swap gating (issue #84). A swapped-out pick = one swap used.
  const swapsUsed = swappedRoster.length
  const swapLocked = swapsLocked(season, episodes)
  const swapCapReached = swapsUsed >= season.max_swaps

  // Double Roster Points target the next open episode's roster scoring (#81).
  const nextOpenEpisode = episodes.find((e) => isEpisodeOpen(e, season))
  const ownedDoubleRoster = plays.filter(
    (p) => p.episode_id === null && p.advantage_type === 'double_roster_points',
  )
  const activeDoubleRoster = plays.filter(
    (p) =>
      nextOpenEpisode != null &&
      p.episode_id === nextOpenEpisode.id &&
      p.advantage_type === 'double_roster_points',
  )
  const doubledRosterIds = new Set(activeDoubleRoster.map((p) => p.target_contestant_id))
  const doubleTargets = activeRoster.filter((p) => !doubledRosterIds.has(p.contestant_id))

  // Whether the current selection differs from the saved roster (#94): drives
  // the save button's enabled/label state so it's clear a click is needed.
  const savedContestantIds = new Set(activeRoster.map((r) => r.contestant_id))
  const rosterDirty =
    selected.size !== savedContestantIds.size ||
    [...selected].some((id) => !savedContestantIds.has(id))

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < season.roster_size) next.add(id)
      return next
    })
  }

  async function submitRoster() {
    setSubmitting(true)
    setError(null)
    try {
      const picks = await api.post<RosterPick[]>(`/seasons/${season.id}/roster`, {
        contestant_ids: [...selected],
      })
      setRoster(picks)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitSwap() {
    if (!swapOld || !swapNew) return
    setSwapping(true)
    setSwapError(null)
    try {
      // Swaps apply immediately from the next open episode (#9) — no episode choice
      await api.post<RosterPick>(`/seasons/${season.id}/roster/swap`, {
        old_contestant_id: swapOld,
        new_contestant_id: swapNew,
      })
      setRoster(await api.get<RosterPick[]>(`/seasons/${season.id}/roster/${userId}`))
      setSwapOld('')
      setSwapNew('')
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : 'Swap failed')
    } finally {
      setSwapping(false)
    }
  }

  function replacePlay(updated: AdvantagePlay) {
    setPlays((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  async function playDoubleRoster(play: AdvantagePlay, targetContestantId: string) {
    setAdvBusy(true)
    setAdvError(null)
    try {
      replacePlay(
        await api.post<AdvantagePlay>(`/advantage-plays/${play.id}/use`, {
          target_contestant_id: targetContestantId,
        }),
      )
      setDblTarget('')
    } catch (e) {
      setAdvError(e instanceof Error ? e.message : 'Advantage failed')
    } finally {
      setAdvBusy(false)
    }
  }

  async function takeBackDoubleRoster(play: AdvantagePlay) {
    setAdvBusy(true)
    setAdvError(null)
    try {
      replacePlay(await api.delete<AdvantagePlay>(`/advantage-plays/${play.id}/use`))
    } catch (e) {
      setAdvError(e instanceof Error ? e.message : 'Take back failed')
    } finally {
      setAdvBusy(false)
    }
  }

  return (
    <div>
      <SectionTitle>
        My Roster{' '}
        {lockEpisode && (
          <LockBadge
            lockAt={lockEpisode.picks_lock_at}
            scored={lockEpisode.status === 'scored'}
          />
        )}
      </SectionTitle>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {!windowOpen && hasRoster ? (
        <div className="space-y-6">
          <ul className="space-y-2.5">
            {/* Boots sink to the bottom (#190); stable sort keeps the rest in place. */}
            {[...activeRoster]
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
                ssWindowOpen={ssOpen}
                swappedInEpisode={
                  pick.active_from_episode > rosterBaseEp ? pick.active_from_episode : null
                }
                doubled={doubledRosterIds.has(pick.contestant_id)}
                right={<Points value={rosterPoints.get(pick.contestant_id)} />}
              />
            ))}
            {/* Contestant rows show BASE points; a played double earns its
                own line so the numbers above never silently inflate (#136). */}
            {plays
              .filter(
                (p) =>
                  p.advantage_type === 'double_roster_points' &&
                  p.episode_id != null &&
                  p.points_earned != null &&
                  p.points_earned !== 0,
              )
              .map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between p-3 bg-ocean-50 border border-ocean-100 rounded-lg text-sm"
                >
                  <span className="text-ocean-800">
                    Double Roster Points —{' '}
                    <span className="font-medium">
                      {contestantMap.get(p.target_contestant_id ?? '')?.name ?? '—'}
                    </span>
                  </span>
                  <Points value={p.points_earned ?? undefined} />
                </li>
              ))}
          </ul>

          {nextOpenEpisode != null &&
            !nextOpenEpisode.is_finale &&
            (ownedDoubleRoster.length > 0 || activeDoubleRoster.length > 0) && (
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Advantages · Episode {nextOpenEpisode.episode_number}
                </p>
                {activeDoubleRoster.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">
                      Double Roster Points on{' '}
                      <span className="font-medium">
                        {contestantMap.get(d.target_contestant_id ?? '')?.name ?? '—'}
                      </span>
                    </span>
                    <button
                      onClick={() => void takeBackDoubleRoster(d)}
                      disabled={advBusy}
                      className="text-xs text-amber-700 hover:text-amber-900 font-medium"
                    >
                      Take back
                    </button>
                  </div>
                ))}
                {ownedDoubleRoster.length > 0 &&
                  (doubleTargets.length > 0 ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-700 shrink-0">
                        Double roster pts
                        {ownedDoubleRoster.length > 1
                          ? ` (${ownedDoubleRoster.length} owned)`
                          : ''}
                        :
                      </span>
                      <select
                        value={dblTarget}
                        onChange={(e) => setDblTarget(e.target.value)}
                        className="flex-1 min-w-0 border border-amber-200 rounded-lg px-2 py-1 text-sm bg-white"
                      >
                        <option value="">Choose…</option>
                        {doubleTargets.map((p) => (
                          <option key={p.id} value={p.contestant_id}>
                            {contestantMap.get(p.contestant_id)?.name ?? '—'}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => void playDoubleRoster(ownedDoubleRoster[0], dblTarget)}
                        disabled={advBusy || !dblTarget}
                        className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-lg disabled:opacity-40 hover:bg-amber-700 transition-colors"
                      >
                        Double ×2
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      You own {ownedDoubleRoster.length} Double Roster Points — every active
                      pick is already doubled this episode.
                    </p>
                  ))}
                {advError && <p className="text-red-600 text-xs">{advError}</p>}
              </div>
            )}

          {swappedRoster.length > 0 && (
            <div>
              <SectionTitle>Swapped Out</SectionTitle>
              <ul className="space-y-2">
                {swappedRoster.map((pick) => {
                  const c = contestantMap.get(pick.contestant_id)
                  return (
                    <li
                      key={pick.id}
                      className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg text-gray-400"
                    >
                      <Link
                        to={`/contestants/${pick.contestant_id}`}
                        className="line-through hover:text-gray-600"
                      >
                        {c?.name ?? '—'}
                      </Link>
                      <span className="text-xs flex items-center gap-2">
                        <Points value={rosterPoints.get(pick.contestant_id)} />
                        <span>
                          ep {pick.active_from_episode}–{pick.active_until_episode}
                          {pick.swap_penalty_points !== 0 && (
                            <span className="ml-1 text-red-400">· swap {pick.swap_penalty_points}</span>
                          )}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {season.status !== 'completed' && (
            <div className="pt-4 border-t border-gray-100">
              <SectionTitle>
                Swap a Roster Pick (
                {Math.max(0, season.free_swaps - swapsUsed) > 0
                  ? `${season.free_swaps - swapsUsed} free, then ${season.swap_token_cost} tokens each`
                  : `costs ${season.swap_token_cost} tokens`}
                )
              </SectionTitle>
              <p className="text-xs text-gray-400 mb-3">
                {swapsUsed} of {season.max_swaps} swaps used
                {season.swap_lock_episode != null &&
                  ` · swaps lock at episode ${season.swap_lock_episode}`}
              </p>
              {swapLocked ? (
                <p className="text-sm text-gray-500">
                  Roster swaps are locked for the rest of the season.
                </p>
              ) : swapCapReached ? (
                <p className="text-sm text-gray-500">
                  Swap limit reached — no swaps left this season.
                </p>
              ) : upcomingEpisodes.length > 0 && swapCandidates.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex gap-3 flex-wrap">
                    <select
                      value={swapOld}
                      onChange={(e) => setSwapOld(e.target.value)}
                      className="flex-1 min-w-0 border border-sand-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Drop contestant…</option>
                      {activeRoster.map((pick) => (
                        <option key={pick.id} value={pick.contestant_id}>
                          {contestantMap.get(pick.contestant_id)?.name ?? pick.contestant_id}
                        </option>
                      ))}
                    </select>
                    <select
                      value={swapNew}
                      onChange={(e) => setSwapNew(e.target.value)}
                      className="flex-1 min-w-0 border border-sand-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Add contestant…</option>
                      {swapCandidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-gray-400">Takes effect from the next episode.</p>
                  {swapError && <p className="text-red-600 text-sm">{swapError}</p>}
                  <button
                    onClick={submitSwap}
                    disabled={!swapOld || !swapNew || swapping}
                    className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-gray-900 transition-colors"
                  >
                    {swapping ? 'Swapping…' : 'Confirm Swap'}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No swaps available right now.</p>
              )}
            </div>
          )}
        </div>
      ) : windowOpen ? (
        <div>
          <p className="text-sm text-gray-600 mb-1">
            {hasRoster
              ? `Rearrange your roster freely before episode ${season.roster_lock_episode} — no penalty.`
              : `Pick ${season.roster_size} castaways for your season roster.`}
          </p>
          <p className="text-xs text-gray-400 mb-4">
            Lock-in before episode {season.roster_lock_episode} · {selected.size} /{' '}
            {season.roster_size} selected
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {contestants.map((c) => {
              const isSelected = selected.has(c.id)
              const isOut = c.eliminated_in_episode != null
              const maxed = !isSelected && selected.size >= season.roster_size
              // Can't add an eliminated castaway; an already-rostered one stays
              // removable so you can drop it (e.g. a premiere boot).
              const blocked = maxed || (isOut && !isSelected)
              return (
                <button
                  key={c.id}
                  onClick={() => toggleSelect(c.id)}
                  disabled={blocked}
                  className={[
                    'flex items-center gap-2 p-3 rounded-lg border text-left text-sm font-medium transition-colors',
                    isSelected && isOut
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : isSelected
                        ? 'border-ocean-500 bg-ocean-50 text-ocean-900'
                        : blocked
                          ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : 'border-sand-200 bg-white text-gray-700 hover:border-gray-300',
                  ].join(' ')}
                >
                  <ContestantAvatar name={c.name} imageUrl={c.image_url} size="sm" />
                  <span className={isOut ? 'line-through' : ''}>{c.name}</span>
                  {isOut && (
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-red-500">
                      out
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={submitRoster}
              disabled={selected.size !== season.roster_size || !rosterDirty || submitting}
              className="px-4 py-2 bg-jungle-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-jungle-700 transition-colors"
            >
              {submitting ? 'Saving…' : hasRoster ? 'Save changes' : 'Lock In Roster'}
            </button>
            {hasRoster && (
              <span className={`text-xs ${rosterDirty ? 'text-amber-600' : 'text-gray-400'}`}>
                {rosterDirty ? 'Unsaved changes' : 'Saved ✓'}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          {season.roster_lock_episode == null
            ? 'Roster submission window has not opened yet.'
            : 'Roster submission window has closed.'}
        </p>
      )}
    </div>
  )
}

// ─── Picks section ──────────────────────────────────────────────────────────

function PicksSection({
  season,
  contestants,
  episodes,
  userId,
  plays,
  setPlays,
  pickResults,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
  plays: AdvantagePlay[]
  setPlays: React.Dispatch<React.SetStateAction<AdvantagePlay[]>>
  pickResults: Map<string, PickResult>
}) {
  const [picksByEpisode, setPicksByEpisode] = useState<Map<string, EliminationPick[]>>(new Map())
  const [pending, setPending] = useState<Map<string, Set<string>>>(new Map())
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [doubleTarget, setDoubleTarget] = useState('')
  const [advBusy, setAdvBusy] = useState(false)
  const [advError, setAdvError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    async function load() {
      const results = await Promise.all(
        episodes.map((ep) =>
          api
            .get<EliminationPick[]>(`/episodes/${ep.id}/picks/${userId}`)
            .then((picks): [string, EliminationPick[]] => [ep.id, picks])
            .catch((): [string, EliminationPick[]] => [ep.id, []]),
        ),
      )
      const picksMap = new Map(results)
      setPicksByEpisode(picksMap)
      // Drop picks whose castaway was eliminated in an EARLIER episode (#96):
      // they can't come true, and leaving them wastes a vote slot and shows up
      // as a Double Vote target. Seeds the editable set with only live picks.
      const elimEp = new Map(contestants.map((c) => [c.id, c.eliminated_in_episode]))
      const pendingMap = new Map<string, Set<string>>()
      for (const ep of episodes) {
        if (isEpisodeOpen(ep, season)) {
          const saved = picksMap.get(ep.id) ?? []
          const live = saved.filter((p) => {
            const out = elimEp.get(p.contestant_id)
            return out == null || out >= ep.episode_number
          })
          pendingMap.set(ep.id, new Set(live.map((p) => p.contestant_id)))
        }
      }
      setPending(pendingMap)
    }
    void load()
  }, [episodes, season, userId, contestants])

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const isOpen = (ep: Episode) => isEpisodeOpen(ep, season)

  function togglePick(episodeId: string, contestantId: string, maxPicks: number) {
    setPending((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(episodeId) ?? [])
      if (set.has(contestantId)) set.delete(contestantId)
      else if (set.size < maxPicks) set.add(contestantId)
      next.set(episodeId, set)
      return next
    })
  }

  function replacePlay(updated: AdvantagePlay) {
    setPlays((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  async function applyPlay(play: AdvantagePlay, targetContestantId?: string) {
    setAdvBusy(true)
    setAdvError(null)
    try {
      replacePlay(
        await api.post<AdvantagePlay>(`/advantage-plays/${play.id}/use`, {
          target_contestant_id: targetContestantId ?? null,
        }),
      )
      setDoubleTarget('')
    } catch (e) {
      setAdvError(e instanceof Error ? e.message : 'Advantage failed')
    } finally {
      setAdvBusy(false)
    }
  }

  async function takeBackPlay(play: AdvantagePlay) {
    setAdvBusy(true)
    setAdvError(null)
    try {
      replacePlay(await api.delete<AdvantagePlay>(`/advantage-plays/${play.id}/use`))
    } catch (e) {
      setAdvError(e instanceof Error ? e.message : 'Take back failed')
    } finally {
      setAdvBusy(false)
    }
  }

  function cancelEdit(episodeId: string) {
    const saved = picksByEpisode.get(episodeId) ?? []
    setPending((prev) => new Map(prev).set(episodeId, new Set(saved.map((p) => p.contestant_id))))
    setEditing(false)
  }

  async function submitPicks(episodeId: string) {
    setSubmitting(episodeId)
    setErrors((prev) => {
      const m = new Map(prev)
      m.delete(episodeId)
      return m
    })
    try {
      const picks = await api.post<EliminationPick[]>(`/episodes/${episodeId}/picks`, {
        contestant_ids: [...(pending.get(episodeId) ?? [])],
      })
      setPicksByEpisode((prev) => new Map(prev).set(episodeId, picks))
      setEditing(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Submit failed'
      setErrors((prev) => new Map(prev).set(episodeId, msg))
    } finally {
      setSubmitting(null)
    }
  }

  const nextOpen = episodes.find(isOpen)
  // Watch-only premiere episodes (before roster lock) accept no votes, so they
  // don't belong in "Past Episodes" as "(No votes submitted)" (#82).
  const closedEpisodes = episodes
    .filter(
      (ep) =>
        !isOpen(ep) &&
        !ep.is_finale && // finale votes are the finale ballot, not weekly picks (#86)
        ep.episode_number >= (season.roster_lock_episode ?? 1),
    )
    .reverse()

  return (
    <div>
      <SectionTitle>
        Weekly Votes{' '}
        {nextOpen && <LockBadge lockAt={nextOpen.picks_lock_at} />}
      </SectionTitle>

      {!nextOpen && closedEpisodes.length === 0 && (
        <p className="text-gray-500 text-sm">No episodes yet.</p>
      )}

      {/* Final week: the weekly vote becomes the 3-part finale ballot (#86);
          it stays visible after lock as the stamped ballot (#189). */}
      {(() => {
        const fin = episodes.find((e) => e.is_finale)
        const show = fin && (nextOpen?.id === fin.id || !isOpen(fin))
        return show ? (
          <FinaleBallot
            season={season}
            contestants={contestants}
            finaleEp={fin}
            userId={userId}
          />
        ) : null
      })()}

      {nextOpen &&
        !nextOpen.is_finale &&
        (() => {
          const ep = nextOpen
          const epPending = pending.get(ep.id) ?? new Set<string>()
          const episodeError = errors.get(ep.id)
          const savedPicks = picksByEpisode.get(ep.id) ?? []
          const hasSavedPicks = savedPicks.length > 0
          const confirmed = hasSavedPicks && !editing

          // Multiple owned advantages can be played per episode (#14):
          // extra votes stack; doubles apply to distinct targets.
          const ownedExtras = plays.filter(
            (p) => p.episode_id === null && p.advantage_type === 'extra_vote',
          )
          const activeExtras = plays.filter(
            (p) => p.episode_id === ep.id && p.advantage_type === 'extra_vote',
          )
          const ownedDoubles = plays.filter(
            (p) => p.episode_id === null && p.advantage_type === 'double_vote_points',
          )
          const activeDoubles = plays.filter(
            (p) => p.episode_id === ep.id && p.advantage_type === 'double_vote_points',
          )
          const doubledIds = new Set(activeDoubles.map((p) => p.target_contestant_id))
          const undoubledSelected = [...epPending].filter((cid) => !doubledIds.has(cid))
          const maxPicks = ep.max_elimination_picks + activeExtras.length

          return (
            <div className="mb-6 p-4 bg-white border border-sand-200 rounded-xl">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-gray-900">Episode {ep.episode_number}</h3>
                <span className="text-xs text-gray-400">Locks {formatCentral(ep.picks_lock_at)}</span>
              </div>
              {confirmed ? (
                <div className="mb-4 p-5 bg-green-50 border-2 border-green-500 rounded-xl text-center">
                  <p className="text-3xl mb-1">🔥</p>
                  <p className="font-semibold text-green-800 mb-3">
                    Votes locked in for Episode {ep.episode_number}
                  </p>
                  {savedPicks.length < maxPicks && (
                    <p className="text-xs text-green-700 mb-3">
                      {savedPicks.length} of {maxPicks} votes used — Edit below to add{' '}
                      {maxPicks - savedPicks.length} more before lock.
                    </p>
                  )}
                  <div className="flex flex-wrap justify-center gap-2">
                    {savedPicks.map((p) => {
                      const sc = contestantMap.get(p.contestant_id)
                      // Voted-for someone already eliminated earlier — no longer eligible (#5)
                      const stale =
                        sc?.eliminated_in_episode != null &&
                        sc.eliminated_in_episode < ep.episode_number
                      return (
                        <span
                          key={p.id}
                          className={`text-sm px-3 py-1.5 bg-white border rounded-lg font-medium ${
                            stale
                              ? 'border-sand-200 text-gray-400 line-through'
                              : 'border-green-200 text-gray-800'
                          }`}
                        >
                          {sc?.name ?? '—'}
                          {doubledIds.has(p.contestant_id) && (
                            <span className="text-ocean-600 font-semibold no-underline"> ×2</span>
                          )}
                          {stale && (
                            <span className="ml-1 text-[10px] no-underline">(out)</span>
                          )}
                        </span>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-4">
                    Vote for up to {maxPicks} to be eliminated · {epPending.size} / {maxPicks} selected
                    {activeExtras.length > 0 && ` · +${activeExtras.length} extra vote${activeExtras.length > 1 ? 's' : ''}`}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                    {contestants.map((c) => {
                      const isOut = c.eliminated_in_episode != null
                      const isSelected = epPending.has(c.id)
                      const isDoubled = doubledIds.has(c.id)
                      const maxed = !isSelected && epPending.size >= maxPicks
                      return (
                        <button
                          key={c.id}
                          onClick={() => togglePick(ep.id, c.id, maxPicks)}
                          disabled={maxed || isOut}
                          className={[
                            'flex items-center gap-2 p-2.5 rounded-lg border text-left text-sm font-medium transition-colors',
                            isOut
                              ? 'border-gray-100 bg-gray-50 text-gray-300 line-through cursor-not-allowed'
                              : isSelected
                                ? 'border-ocean-500 bg-ocean-50 text-ocean-900'
                                : maxed
                                  ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                                  : 'border-sand-200 bg-white text-gray-700 hover:border-gray-300',
                          ].join(' ')}
                        >
                          <ContestantAvatar name={c.name} imageUrl={c.image_url} size="sm" />
                          {c.name}
                          {isDoubled && <span className="text-ocean-600 font-semibold"> ×2</span>}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}

              {advantagesLocked(ep, season)
                ? (ownedExtras.length > 0 || ownedDoubles.length > 0) && (
                    <p className="mb-4 text-xs text-amber-600">
                      Advantages are locked for the rest of the season.
                    </p>
                  )
                : (ownedExtras.length > 0 ||
                    activeExtras.length > 0 ||
                    ownedDoubles.length > 0 ||
                    activeDoubles.length > 0) && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-lg space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                        Advantages
                      </p>
                  {activeExtras.length > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">
                        {activeExtras.length} Extra Vote{activeExtras.length > 1 ? 's' : ''} in
                        play — you can vote for {activeExtras.length} more this episode
                      </span>
                      <button
                        onClick={() => void takeBackPlay(activeExtras[activeExtras.length - 1])}
                        disabled={advBusy}
                        className="text-xs text-amber-700 hover:text-amber-900 font-medium"
                      >
                        Take one back
                      </button>
                    </div>
                  )}
                  {ownedExtras.length > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">
                        You own {ownedExtras.length} Extra Vote{ownedExtras.length > 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => void applyPlay(ownedExtras[0])}
                        disabled={advBusy}
                        className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-lg disabled:opacity-40 hover:bg-amber-700 transition-colors"
                      >
                        Play one (+1 vote)
                      </button>
                    </div>
                  )}
                  {activeDoubles.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">
                        Double Vote Points on{' '}
                        <span className="font-medium">
                          {contestantMap.get(d.target_contestant_id ?? '')?.name ?? '—'}
                        </span>
                      </span>
                      <button
                        onClick={() => void takeBackPlay(d)}
                        disabled={advBusy}
                        className="text-xs text-amber-700 hover:text-amber-900 font-medium"
                      >
                        Take back
                      </button>
                    </div>
                  ))}
                  {ownedDoubles.length > 0 &&
                    (undoubledSelected.length > 0 ? (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-700 shrink-0">
                          Double a vote{ownedDoubles.length > 1 ? ` (${ownedDoubles.length} owned)` : ''}:
                        </span>
                        <select
                          value={doubleTarget}
                          onChange={(e) => setDoubleTarget(e.target.value)}
                          className="flex-1 min-w-0 border border-amber-200 rounded-lg px-2 py-1 text-sm bg-white"
                        >
                          <option value="">Choose…</option>
                          {undoubledSelected.map((cid) => (
                            <option key={cid} value={cid}>
                              {contestantMap.get(cid)?.name ?? '—'}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => void applyPlay(ownedDoubles[0], doubleTarget)}
                          disabled={advBusy || !doubleTarget}
                          className="px-3 py-1 bg-amber-600 text-white text-xs font-medium rounded-lg disabled:opacity-40 hover:bg-amber-700 transition-colors"
                        >
                          Double ×2
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        You own {ownedDoubles.length} Double Vote Points — select more votes to
                        double.
                      </p>
                    ))}
                  {advError && <p className="text-red-600 text-xs">{advError}</p>}
                </div>
              )}

              {episodeError && <p className="text-red-600 text-sm mb-3">{episodeError}</p>}
              {confirmed ? (
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setEditing(true)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:border-gray-400 transition-colors"
                  >
                    Edit Votes
                  </button>
                  <span className="text-xs text-gray-400">
                    Editable until {formatCentral(ep.picks_lock_at)}
                  </span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => submitPicks(ep.id)}
                    disabled={submitting === ep.id || epPending.size === 0}
                    className="flex-1 px-4 py-2.5 bg-jungle-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-jungle-700 transition-colors"
                  >
                    {submitting === ep.id ? 'Locking in…' : '🔥 Lock In Votes'}
                  </button>
                  {hasSavedPicks && (
                    <button
                      onClick={() => cancelEdit(ep.id)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:border-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })()}

      {closedEpisodes.length > 0 && (
        <div>
          {nextOpen && (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Past Episodes
            </h3>
          )}
          <div className="space-y-3">
            {closedEpisodes.map((ep) => {
              const picks = picksByEpisode.get(ep.id) ?? []
              const scored = ep.status === 'scored'
              return (
                <div key={ep.id} className="p-4 bg-gray-50 border border-gray-100 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-700">Episode {ep.episode_number}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        scored ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {ep.status}
                    </span>
                  </div>
                  {picks.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {picks.map((p) => {
                        const result = pickResults.get(`${ep.id}:${p.contestant_id}`)
                        const name = contestantMap.get(p.contestant_id)?.name ?? '—'
                        const doubled = plays.some(
                          (pl) =>
                            pl.episode_id === ep.id &&
                            pl.advantage_type === 'double_vote_points' &&
                            pl.target_contestant_id === p.contestant_id,
                        )
                        // Only scored episodes have a settled result to color
                        // (#53). Incorrect stays neutral, not red — most votes
                        // miss, and a wall of red feels bad (#135).
                        const cls = !scored
                          ? 'bg-white border-sand-200 text-gray-700'
                          : result?.correct
                            ? 'bg-green-50 border-green-300 text-green-800'
                            : 'bg-white border-sand-200 text-gray-500'
                        // Pick chip shows the BASE points; the double's own
                        // earnings render as a separate chip beside it (#136).
                        return (
                          <span key={p.id} className="contents">
                            <span
                              className={`text-sm px-2 py-1 border rounded-md ${cls}`}
                            >
                              {scored && result?.correct && '✓ '}
                              {name}
                              {doubled && (
                                <span className="text-ocean-600 font-semibold"> ×2</span>
                              )}
                              {scored && result?.correct && result.points > 0 && (
                                <span className="ml-1 font-semibold">
                                  +{result.points}
                                </span>
                              )}
                            </span>
                            {doubled && scored && result?.correct && result.points > 0 && (
                              <span className="text-sm px-2 py-1 border rounded-md bg-ocean-50 border-ocean-200 text-ocean-700">
                                Double Vote Points{' '}
                                <span className="font-semibold">+{result.points}</span>
                              </span>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No votes submitted</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Finale ballot (final week's weekly vote) ───────────────────────────────

function FinaleBallot({
  season,
  contestants,
  finaleEp,
  userId,
}: {
  season: Season
  contestants: Contestant[]
  finaleEp: Episode
  userId: string
}) {
  const [earlyBoot, setEarlyBoot] = useState('')
  const [fireLoss, setFireLoss] = useState('')
  const [winner, setWinner] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Saved ballot shows as a display state with Edit until lock (#189)
  const [hasSaved, setHasSaved] = useState(false)
  const [editing, setEditing] = useState(false)

  const locked = !isEpisodeOpen(finaleEp, season)

  useEffect(() => {
    api
      .get<FinalePrediction>(`/seasons/${season.id}/finale-predictions/${userId}`)
      .then((pred) => {
        setEarlyBoot(pred.early_boot_contestant_id ?? '')
        setFireLoss(pred.fire_loss_contestant_id ?? '')
        setWinner(pred.winner_contestant_id ?? '')
        setHasSaved(
          Boolean(
            pred.early_boot_contestant_id ??
              pred.fire_loss_contestant_id ??
              pred.winner_contestant_id,
          ),
        )
      })
      .catch(() => {
        // No prediction yet — form starts empty
      })
  }, [season.id, userId])

  // Alive at the finale: never-eliminated OR eliminated in the finale
  // itself — the ballot predicts the finale's boots, so they stay listed
  // even when results land before the window closes (matches the server).
  const alive = contestants.filter(
    (c) =>
      c.eliminated_in_episode == null ||
      c.eliminated_in_episode === finaleEp.episode_number,
  )
  const picks = [
    {
      id: 'early-boot',
      label: 'First Boot',
      description: 'First person eliminated on finale night',
      value: earlyBoot,
      onChange: setEarlyBoot,
    },
    {
      id: 'fire-loss',
      label: 'Fire-Making Loser',
      description: 'Loses the fire-making challenge',
      value: fireLoss,
      onChange: setFireLoss,
    },
    {
      id: 'winner',
      label: 'Sole Survivor',
      description: 'Wins the game',
      value: winner,
      onChange: setWinner,
    },
  ]

  async function submitBallot() {
    setSubmitting(true)
    setError(null)
    setSaved(false)
    try {
      await api.post<FinalePrediction>(`/seasons/${season.id}/finale-predictions`, {
        early_boot_contestant_id: earlyBoot || null,
        fire_loss_contestant_id: fireLoss || null,
        winner_contestant_id: winner || null,
      })
      setSaved(true)
      setHasSaved(Boolean(earlyBoot || fireLoss || winner))
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  const nameOf = (id: string) => contestants.find((c) => c.id === id)?.name ?? '—'

  return (
    <div className="mb-6 p-4 bg-white border border-sand-200 rounded-xl">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-gray-900">
          Finale · Episode {finaleEp.episode_number}
        </h3>
        <LockBadge
          lockAt={finaleEp.picks_lock_at}
          scored={finaleEp.status === 'scored'}
        />
      </div>

      {locked && !hasSaved ? (
        <p className="text-sm text-gray-600 mt-2">
          No ballot submitted — the window has closed.
        </p>
      ) : locked || (hasSaved && !editing) ? (
        <div className="mt-2 p-5 bg-green-50 border-2 border-green-500 rounded-xl text-center">
          <p className="text-3xl mb-1">🔥</p>
          <p className="font-semibold text-green-800 mb-3">
            {locked ? 'Finale ballot locked' : 'Finale ballot in'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {picks.map(({ id, label, value }) => (
              <span
                key={id}
                className="text-sm px-3 py-1.5 bg-white border border-green-200 rounded-lg text-left"
              >
                <span className="block text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
                  {label}
                </span>
                <span className="font-medium text-gray-800">
                  {value ? nameOf(value) : 'No pick'}
                </span>
              </span>
            ))}
          </div>
          {!locked && (
            <button
              onClick={() => {
                setEditing(true)
                setSaved(false)
              }}
              className="mt-4 px-4 py-1.5 text-sm font-medium text-green-800 bg-white border border-green-300 rounded-lg hover:bg-green-100 transition-colors"
            >
              Edit ballot
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-4">Make your three finale predictions.</p>

          <div className="space-y-4 mb-4">
            {picks.map(({ id, label, description, value, onChange }) => (
              <div key={id}>
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 border-l-2 border-ember-500 pl-2 mb-0.5">
                  {label}
                </label>
                <p className="text-xs text-gray-400 mb-1.5">{description}</p>
                <select
                  value={value}
                  onChange={(e) => {
                    onChange(e.target.value)
                    setSaved(false)
                  }}
                  className="w-full border border-sand-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">No pick</option>
                  {alive.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          {saved && <p className="text-green-600 text-sm mb-3">Ballot saved.</p>}

          <button
            onClick={() => void submitBallot()}
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-jungle-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-jungle-700 transition-colors"
          >
            {submitting ? 'Saving…' : '🔥 Lock In Finale Ballot'}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Sole Survivor section (#164) ───────────────────────────────────────────

function SoleSurvivorSection({
  season,
  contestants,
  episodes,
  userId,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
}) {
  const [roster, setRoster] = useState<RosterPick[]>([])
  const [choice, setChoice] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<RosterPick[]>(`/seasons/${season.id}/roster/${userId}`)
      .then((picks) => {
        setRoster(picks)
        const current = picks.find((p) => p.is_sole_survivor)
        if (current) setChoice(current.contestant_id)
      })
      .catch(() => setRoster([]))
  }, [season.id, userId])

  const nameOf = (id: string) => contestants.find((c) => c.id === id)?.name ?? '—'
  // Eliminated castaways can linger on an active roster (never swapped out) —
  // they're not valid designees (#180)
  const active = roster.filter(
    (p) =>
      p.active_until_episode === null &&
      contestants.find((c) => c.id === p.contestant_id)?.eliminated_in_episode == null,
  )
  const designee = roster.find((p) => p.is_sole_survivor)

  const lockEp = ssLockEpisodeNumber(season, episodes)
  const lockEpisode = episodes.find((e) => e.episode_number === lockEp)
  const windowOpen = ssDesignationOpen(season, episodes)

  async function designate() {
    if (!choice) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await api.post<RosterPick>(`/seasons/${season.id}/sole-survivor`, {
        contestant_id: choice,
      })
      setRoster((rs) =>
        rs.map((p) => ({ ...p, is_sole_survivor: p.contestant_id === choice })),
      )
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Designation failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SectionTitle>
        Sole Survivor{' '}
        {lockEpisode && (
          <LockBadge
            lockAt={lockEpisode.picks_lock_at}
            scored={lockEpisode.status === 'scored'}
          />
        )}
      </SectionTitle>
      <p className="text-xs text-gray-400 mb-3">
        Everything your Sole Survivor scores in the finale counts double for you.
      </p>
      {!windowOpen ? (
        <p className="text-sm text-gray-600">
          {designee ? (
            <>
              Your Sole Survivor:{' '}
              <span className="font-medium text-gray-900">{nameOf(designee.contestant_id)}</span>
            </>
          ) : (
            'No Sole Survivor designated — the window has closed.'
          )}
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">
            Locks before episode {lockEp}
            {lockEpisode && <> ({formatCentral(lockEpisode.picks_lock_at)})</>} · changeable
            until then · must be on your roster
          </p>
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={choice}
              onChange={(e) => {
                setChoice(e.target.value)
                setSaved(false)
              }}
              className="flex-1 min-w-0 border border-sand-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select your Sole Survivor…</option>
              {active.map((p) => (
                <option key={p.id} value={p.contestant_id}>
                  {nameOf(p.contestant_id)}
                </option>
              ))}
            </select>
            <button
              onClick={designate}
              disabled={!choice || saving}
              className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-amber-600 transition-colors"
            >
              {saving ? 'Saving…' : 'Designate'}
            </button>
          </div>
          {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
          {saved && <p className="text-green-600 text-sm mt-2">Designated.</p>}
        </>
      )}
    </div>
  )
}

// ─── Winner section ─────────────────────────────────────────────────────────

function WinnerSection({
  season,
  contestants,
  episodes,
  userId,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
}) {
  const [winner, setWinner] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api
      .get<WinnerPick>(`/seasons/${season.id}/winner-picks/${userId}`)
      .then((p) => setWinner(p.winner_contestant_id))
      .catch(() => {
        // No pick yet — form starts empty
      })
  }, [season.id, userId])

  const lockEpisode =
    season.winner_lock_episode != null
      ? (episodes.find((e) => e.episode_number === season.winner_lock_episode) ?? null)
      : null
  const windowOpen =
    season.winner_lock_episode != null &&
    season.status !== 'completed' &&
    (lockEpisode == null ||
      (lockEpisode.status !== 'scored' && new Date(lockEpisode.picks_lock_at) > new Date()))

  const alive = contestants.filter((c) => c.eliminated_in_episode == null)
  const pickedName = contestants.find((c) => c.id === winner)?.name

  async function submitPick() {
    if (!winner) return
    setSubmitting(true)
    setSubmitError(null)
    setSaved(false)
    try {
      await api.post<WinnerPick>(`/seasons/${season.id}/winner-picks`, {
        winner_contestant_id: winner,
      })
      setSaved(true)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <SectionTitle>
        Winner Pick{' '}
        {lockEpisode && (
          <LockBadge
            lockAt={lockEpisode.picks_lock_at}
            scored={lockEpisode.status === 'scored'}
          />
        )}
      </SectionTitle>
      {!windowOpen ? (
        <p className="text-sm text-gray-600">
          {winner ? (
            <>
              Your winner pick: <span className="font-medium text-gray-900">{pickedName}</span>
            </>
          ) : season.winner_lock_episode ? (
            'Winner pick window has closed.'
          ) : (
            'Winner pick window has not opened yet.'
          )}
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-3">
            Locks before episode {season.winner_lock_episode}
            {lockEpisode && <> ({formatCentral(lockEpisode.picks_lock_at)})</>} · changeable until
            then
          </p>
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={winner}
              onChange={(e) => {
                setWinner(e.target.value)
                setSaved(false)
              }}
              className="flex-1 min-w-0 border border-sand-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select a winner…</option>
              {alive.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={submitPick}
              disabled={!winner || submitting}
              className="px-4 py-2 bg-jungle-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-jungle-700 transition-colors"
            >
              {submitting ? 'Saving…' : 'Save Pick'}
            </button>
          </div>
          {submitError && <p className="text-red-600 text-sm mt-2">{submitError}</p>}
          {saved && <p className="text-green-600 text-sm mt-2">Pick saved.</p>}
        </>
      )}
    </div>
  )
}

// ─── Tokens section ─────────────────────────────────────────────────────────

function TokensSection({
  balance,
  plays,
  contestants,
  episodes,
  seasonId,
  userId,
}: {
  balance: number | null
  plays: AdvantagePlay[]
  contestants: Contestant[]
  episodes: Episode[]
  seasonId: string
  userId: string
}) {
  const [history, setHistory] = useState<TokenLedgerEntry[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  function toggleHistory() {
    if (history) {
      setHistory(null)
      return
    }
    setLoadingHistory(true)
    void api
      .get<TokenLedgerEntry[]>(`/seasons/${seasonId}/tokens/${userId}/history`)
      .then(setHistory)
      .finally(() => setLoadingHistory(false))
  }

  // Friendly ledger description. Under the per-episode token model an
  // allocation reads "Episode N tokens", not "Weekly Allocation" (#97).
  function txnDescription(h: TokenLedgerEntry): string {
    const cap = (s: string) =>
      s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
    switch (h.transaction_type) {
      case 'weekly_allocation':
        return h.episode_number != null ? `Episode ${h.episode_number} tokens` : 'Token allocation'
      case 'starting_allocation':
        return 'Starting tokens'
      case 'advantage_spend':
        return h.description ? `Bought ${cap(h.description)}` : 'Bought advantage'
      default:
        return h.description ?? cap(h.transaction_type)
    }
  }

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const scoredIds = new Set(episodes.filter((e) => e.status === 'scored').map((e) => e.id))
  const epNum = new Map(episodes.map((e) => [e.id, e.episode_number]))

  // "Active" only while its episode is still to come — a played advantage on a
  // scored episode has already applied and is spent, not active (#13).
  const active = plays.filter((p) => p.episode_id !== null && !scoredIds.has(p.episode_id))
  const used = plays.filter((p) => p.episode_id !== null && scoredIds.has(p.episode_id))
  const owned = plays.filter((p) => p.episode_id === null)

  // Aggregate duplicate owned advantages (#2)
  const ownedCounts = new Map<string, number>()
  for (const p of owned) ownedCounts.set(p.advantage_type, (ownedCounts.get(p.advantage_type) ?? 0) + 1)

  // Owned advantages can't be played on the finale (#15)
  const nextOpen = [...episodes]
    .sort((a, b) => a.episode_number - b.episode_number)
    .find((e) => e.status !== 'scored')
  const finaleOnly = owned.length > 0 && nextOpen?.is_finale === true

  function pretty(type: string) {
    return type
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }
  function withTarget(p: AdvantagePlay) {
    const name = p.target_contestant_id ? contestantMap.get(p.target_contestant_id)?.name : undefined
    return pretty(p.advantage_type) + (name ? ` · ${name}` : '')
  }

  return (
    <div>
      <SectionTitle>Tokens & Advantages</SectionTitle>
      <div className="flex items-baseline gap-3 mb-3">
        <span className="text-2xl font-bold text-gray-900">{balance ?? '—'}</span>
        <span className="text-sm text-gray-500">tokens</span>
        <button
          onClick={toggleHistory}
          className="text-sm text-ocean-600 hover:text-ocean-800 font-medium"
        >
          {history ? 'Hide history' : loadingHistory ? 'Loading…' : 'History'}
        </button>
      </div>
      {history && (
        <ul className="mb-4 space-y-1 text-sm border border-gray-100 rounded-lg p-3 bg-gray-50">
          {history.length === 0 && <li className="text-gray-400">No token activity yet.</li>}
          {history.map((h, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="text-gray-600">
                {txnDescription(h)}
                {h.transaction_type !== 'weekly_allocation' &&
                  h.transaction_type !== 'advantage_spend' &&
                  h.episode_number != null && (
                    <span className="text-gray-400"> · ep {h.episode_number}</span>
                  )}
              </span>
              <span
                className={`font-medium shrink-0 ${
                  h.amount >= 0 ? 'text-green-600' : 'text-red-500'
                }`}
              >
                {h.amount >= 0 ? '+' : ''}
                {h.amount}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(active.length > 0 || owned.length > 0 || used.length > 0) && (
        <ul className="space-y-1 text-sm">
          {active.map((p) => (
            <li key={p.id} className="text-gray-700">
              <span className="text-green-600 font-medium">Active</span> — {withTarget(p)}
            </li>
          ))}
          {[...ownedCounts].map(([type, n]) => (
            <li key={type} className="text-gray-500">
              Owned — {pretty(type)}
              {n > 1 && ` (×${n})`}
            </li>
          ))}
          {used.map((p) => (
            <li key={p.id} className="text-gray-400">
              Used (ep {p.episode_id ? (epNum.get(p.episode_id) ?? '?') : '?'}) — {withTarget(p)}
            </li>
          ))}
        </ul>
      )}
      {finaleOnly && (
        <p className="text-xs text-amber-600 mt-2">Advantages can't be used in the finale.</p>
      )}
    </div>
  )
}
