import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router'
import { PageLoader } from '../components/PageLoader'
import { ADV_LABELS } from '../lib/advantages'
import { api, getActiveSeason } from '../lib/api'
import { isBroadcastWindow, resolveMySeasonState } from '../lib/mySeasonState'
import { resolveDrop, SEAL_LIFT_Y, useSealDrag } from '../lib/sealDrag'
import { ContestantAvatar } from '../components/ContestantAvatar'
import { DoublePickSheet } from '../components/DoublePickSheet'
import { EpisodeResultReveal } from '../components/EpisodeResultReveal'
import { LockBadge } from '../components/LockBadge'
import { advantagesLocked, episodeClosed, isEpisodeOpen, openEpisode, ssDesignationOpen, ssLockEpisodeNumber, swapsLocked } from '../lib/episodes'
import { RosterBreakdown } from '../components/RosterBreakdown'
import {
  doubledByContestantEpisode,
  EMPTY_EP_MAP,
  useRosterBreakdown,
} from '../lib/rosterBreakdown'
import { RosterCard } from '../components/RosterCard'
import { CorrectVote } from '../components/CorrectVote'
import { DoubleBadge } from '../components/DoubleBadge'
import { RuleLink } from '../components/RuleLink'
import { SectionShell } from '../components/SectionShell'
import type { Beat, BeatKey } from '../components/SeasonRecord'
import {
  RecordBeats,
  RecordHead,
  RecordLine,
  RecordPanel,
  RecordSection,
  SeasonRecord,
} from '../components/SeasonRecord'
import { VoteMark } from '../components/VoteMark'
import { VoteSlip } from '../components/VoteSlip'
import { formatCentral } from '../lib/time'
import { useAuth } from '../auth/useAuth'
import type {
  AdvantagePlay,
  Contestant,
  EliminationPick,
  Episode,
  EpisodeResult,
  FinalePrediction,
  HubEntry,
  PickResult,
  RosterPick,
  ScoringBreakdown,
  Season,
  StandingEntry,
  StandingSurvivor,
  TokenLedgerEntry,
} from '../types'

// The whole ballot is doubled when Double Ballot Points is played (#303), so the
// carved ×2 idol is stamped onto the ballot once, like a seal pressed on the
// paper (#484) — not repeated per vote, not a banner. Corner press: the host
// container must be `relative`.
function BallotStamp({
  size = 54,
  onPointerDown,
  lifted = false,
  stamp = false,
}: {
  size?: number
  /** When given, the seal is the drag handle for moving the play to the roster
   *  (#487); otherwise it's a passive stamp. */
  onPointerDown?: (e: React.PointerEvent) => void
  lifted?: boolean
  /** Play a one-shot stamp as the ballot double lands here (#487). */
  stamp?: boolean
}) {
  const draggable = onPointerDown != null
  return (
    <span
      onPointerDown={onPointerDown}
      title={
        draggable
          ? 'Drag to the Roster tab to double a castaway instead'
          : 'Double Ballot Points this episode'
      }
      className={`absolute -top-3 right-1 z-20 rotate-[11deg] drop-shadow-[0_3px_4px_rgb(28_25_23_/_0.34)] ${
        draggable ? 'cursor-grab touch-none' : 'pointer-events-none'
      }`}
      style={draggable ? { opacity: lifted ? 0.3 : 1 } : undefined}
    >
      <span className={stamp ? 'seal-stamp' : ''}>
        <DoubleBadge size={size} title="Double Ballot Points this episode" />
      </span>
    </span>
  )
}

/** The idol lifted off the page, following the finger during a drag (#487).
 *  Peels up on grab and springs back to the grab point on a missed drop; both
 *  are gated on prefers-reduced-motion in CSS. */
function SealGhost({ drag }: { drag: { x: number; y: number; releasing?: boolean } | null }) {
  if (!drag) return null
  // Float the idol above the finger, not under it: on a phone the thumb covers
  // the drop point, so a seal sitting there is invisible. Lifted clear of the
  // thumb and enlarged past the resting seal, it reads as picked up (#487).
  return createPortal(
    <div
      aria-hidden
      className={`seal-ghost pointer-events-none fixed z-50 ${drag.releasing ? 'seal-ghost--releasing' : ''}`}
      style={{ left: drag.x, top: drag.y, transform: `translate(-50%, calc(-50% - ${SEAL_LIFT_Y}px))` }}
    >
      <span className="seal-ghost-inner block" style={{ filter: 'drop-shadow(0 8px 12px rgb(0 0 0 / 45%))' }}>
        <DoubleBadge size={44} />
      </span>
    </div>,
    document.body,
  )
}

// My Tribe (roster) and My Votes are separate tabs (#IA split) but share these
// season sections + the one data load, so both pages live in this file.
function useMySeasonData() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [season, setSeason] = useState<Season | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [standing, setStanding] = useState<StandingEntry | null>(null)
  const [breakdown, setBreakdown] = useState<ScoringBreakdown>({ roster: [], picks: [] })
  const [plays, setPlays] = useState<AdvantagePlay[]>([])
  const [rank, setRank] = useState<number | null>(null)
  const [playerCount, setPlayerCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Bumped whenever the roster changes so sibling sections (Sole Survivor)
  // that keep their own roster copy refetch instead of going stale (#219-era
  // pre-lock roster edits).
  const [rosterVersion, setRosterVersion] = useState(0)
  const [automaticResult, setAutomaticResult] = useState<EpisodeResult | null>(null)
  // The beat bar summarises all three sections at once, so the page needs the
  // roster and this episode's ballot even though the sections fetch their own.
  const [roster, setRoster] = useState<RosterPick[]>([])
  const [openPicks, setOpenPicks] = useState<EliminationPick[]>([])
  // Bumped by the ballot when it saves, so the Ballot beat's count follows.
  const [ballotVersion, setBallotVersion] = useState(0)

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

        const [cs, eps, standings, bd, ownPlays, unseenResult] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
          api.get<StandingEntry[]>(`/seasons/${active.id}/standings`),
          api.get<ScoringBreakdown>(`/seasons/${active.id}/scoring-breakdown/${userId}`),
          api.get<AdvantagePlay[]>(`/seasons/${active.id}/advantage-plays/${userId}`),
          api.get<EpisodeResult | undefined>(`/seasons/${active.id}/reveal`),
        ])
        setContestants(cs)
        setEpisodes(eps)
        // Standings come back rank-ordered, so the user's index is their rank.
        const idx = standings.findIndex((s) => s.user_id === userId)
        setRank(idx >= 0 ? idx + 1 : null)
        setPlayerCount(standings.length)
        setStanding(standings.find((s) => s.user_id === userId) ?? null)
        setBreakdown(bd)
        setPlays(ownPlays)
        setAutomaticResult(unseenResult ?? null)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  // Roster and ballot for the beat bar. Separate from the main load so a swap
  // or a saved ballot refreshes the summary without refetching the season.
  const openEp = season ? openEpisode(episodes, season) : undefined
  useEffect(() => {
    if (!season || !userId) return
    api
      .get<RosterPick[]>(`/seasons/${season.id}/roster/${userId}`)
      .then(setRoster)
      .catch(() => setRoster([]))
  }, [season, userId, rosterVersion])
  useEffect(() => {
    if (!openEp || !userId) {
      setOpenPicks([])
      return
    }
    api
      .get<EliminationPick[]>(`/episodes/${openEp.id}/picks/${userId}`)
      .then(setOpenPicks)
      .catch(() => setOpenPicks([]))
  }, [openEp?.id, userId, ballotVersion])

  return {
    userId,
    roster,
    openPicks,
    bumpBallot: () => setBallotVersion((v) => v + 1),
    season,
    contestants,
    episodes,
    standing,
    breakdown,
    plays,
    setPlays,
    rank,
    playerCount,
    loading,
    error,
    rosterVersion,
    bumpRoster: () => setRosterVersion((v) => v + 1),
    automaticResult,
    setAutomaticResult,
  }
}


/**
 * The week's single advantage play (#307).
 *
 * Every player gets exactly one play per episode — spend it on a roster
 * double, a vote double, or a paid roster swap. Both sections of this page
 * read the same play, so whichever surface it was spent on, the other one
 * knows and says so.
 */
function useWeeklyPlay(
  season: Season,
  episodes: Episode[],
  plays: AdvantagePlay[],
  setPlays: React.Dispatch<React.SetStateAction<AdvantagePlay[]>>,
) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ep = openEpisode(episodes, season)
  const play = ep ? plays.find((p) => p.episode_id === ep.id) : undefined
  const locked = ep ? advantagesLocked(ep, season) : true

  async function spend(advantageType: string, targetContestantId?: string) {
    setBusy(true)
    setError(null)
    try {
      const created = await api.post<AdvantagePlay>(
        `/seasons/${season.id}/advantage-plays`,
        {
          advantage_type: advantageType,
          target_contestant_id: targetContestantId ?? null,
        },
      )
      setPlays((prev) => [...prev, created])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Advantage failed')
    } finally {
      setBusy(false)
    }
  }

  async function takeBack(target: AdvantagePlay) {
    setBusy(true)
    setError(null)
    try {
      await api.delete(`/advantage-plays/${target.id}`)
      setPlays((prev) => prev.filter((p) => p.id !== target.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Take back failed')
    } finally {
      setBusy(false)
    }
  }

  /** Play the week's advantage, or swap the current one for another. */
  async function replace(advantageType: string, targetContestantId?: string) {
    if (!ep) return
    setBusy(true)
    setError(null)
    // Show the play on its home (the doubled row, the ballot seal, the strip
    // status) in the same render — whether a first play or a move — instead of
    // after the delete+post round-trip, which read as a hiccup then a pop
    // across beats (#487/#399).
    const base = play ?? { user_id: '', season_id: season.id, token_cost: 0, created_at: '' }
    const optimistic: AdvantagePlay = {
      ...base,
      id: `pending-${play?.id ?? ep.id}`,
      episode_id: ep.id,
      advantage_type: advantageType,
      target_contestant_id: targetContestantId ?? null,
      points_earned: null,
    }
    setPlays((prev) => [...prev.filter((p) => p.id !== play?.id), optimistic])
    try {
      if (play) {
        await api.delete(`/advantage-plays/${play.id}`)
      }
      const created = await api.post<AdvantagePlay>(
        `/seasons/${season.id}/advantage-plays`,
        {
          advantage_type: advantageType,
          target_contestant_id: targetContestantId ?? null,
        },
      )
      setPlays((prev) => [
        ...prev.filter((p) => p.id !== play?.id && p.id !== optimistic.id),
        created,
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Advantage failed')
      // Roll the optimistic entry back to the prior play, or remove it.
      setPlays((prev) => {
        const without = prev.filter((p) => p.id !== optimistic.id)
        return play ? [...without, play] : without
      })
    } finally {
      setBusy(false)
    }
  }

  return { openEpisode: ep, play, locked, busy, error, spend, takeBack, replace }
}

export function MySeasonPage() {
  const d = useMySeasonData()
  // Doubling and swapping are both bought in Advantage and answered on the
  // roster (#394), so the mode has to be visible to the button that starts it
  // and the rows that answer it.
  const [picking, setPicking] = useState<'double' | 'swap' | null>(null)
  // One beat at a time under the masthead. Deep links (#roster/#votes/#advantage)
  // select the matching beat instead of scrolling to it.
  const [beat, setBeat] = useState<BeatKey>(() => {
    // #advantage used to be its own beat; the play now lives in the persistent
    // strip above the beats (#399), so that link lands on the roster.
    const hash = window.location.hash.replace('#', '')
    return hash === 'votes' ? 'ballot' : 'roster'
  })
  // Lags `picking` on the way out only. The record has to keep its overflow
  // open until the halo has finished fading, or the glow is guillotined at the
  // card edge the instant you pick.
  const [stageOpen, setStageOpen] = useState(false)
  // The recap overlay is driven by a `recap=<episode_id>` URL param (#479) so
  // Back closes it instead of leaving the page, and a refresh restores it.
  const [searchParams, setSearchParams] = useSearchParams()
  const recapId = searchParams.get('recap')
  const [replayResult, setReplayResult] = useState<EpisodeResult | null>(null)
  const [replayLoading, setReplayLoading] = useState<string | null>(null)
  const [replayError, setReplayError] = useState<string | null>(null)

  const setRecapParam = useCallback(
    (id: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('recap', id)
        else next.delete('recap')
        return next
      })
    },
    [setSearchParams],
  )

  // The automatic reveal gets its own history entry too, but only the first
  // time it appears — otherwise dismissing it with Back would immediately
  // re-push the param and undo the dismissal. It reappears on the next visit
  // (a fresh mount resets this ref) since it stays unacknowledged.
  const autoPushedFor = useRef<string | null>(null)
  useEffect(() => {
    if (
      d.automaticResult &&
      recapId == null &&
      autoPushedFor.current !== d.automaticResult.episode_id
    ) {
      autoPushedFor.current = d.automaticResult.episode_id
      setRecapParam(d.automaticResult.episode_id)
    }
  }, [d.automaticResult, recapId, setRecapParam])

  // Derives what the recap shows from the URL param alone: absent closes it,
  // matching the automatic result shows that (no fetch needed), otherwise
  // fetch (or reuse) the replay for that episode.
  useEffect(() => {
    if (!recapId) {
      setReplayResult(null)
      return
    }
    if (recapId === d.automaticResult?.episode_id) return
    if (replayResult?.episode_id === recapId) return
    if (!d.season) return
    let live = true
    setReplayLoading(recapId)
    setReplayError(null)
    api
      .get<EpisodeResult>(`/seasons/${d.season.id}/episode-results/${recapId}`)
      .then((res) => {
        if (live) setReplayResult(res)
      })
      .catch((error) => {
        if (!live) return
        setReplayError(error instanceof Error ? error.message : 'Could not load episode result')
        setRecapParam(null)
      })
      .finally(() => {
        if (live) setReplayLoading(null)
      })
    return () => {
      live = false
    }
  }, [recapId, d.season, d.automaticResult?.episode_id, replayResult?.episode_id, setRecapParam])

  useEffect(() => {
    // Only swap uses the in-page stage lighting now; double picks in a focused
    // sheet (#449), so it needs no scrim/halo behind it.
    if (picking === 'swap') {
      setStageOpen(true)
      return
    }
    const timer = window.setTimeout(() => setStageOpen(false), 560)
    return () => window.clearTimeout(timer)
  }, [picking])

  if (d.loading) return <PageLoader />
  if (d.error) return <p className="text-terracotta-600">{d.error}</p>
  if (!d.season || !d.userId) return <p className="text-gray-500">No active season.</p>

  const rosterPoints = new Map(d.breakdown.roster.map((r) => [r.contestant_id, r.points]))
  // Active roster castaways — the valid Roster ×2 targets when the strip idol is
  // dragged onto a row (#399), mirroring RosterSection's own drop rule.
  const eliminatedByContestant = new Map(d.contestants.map((c) => [c.id, c.eliminated_in_episode]))
  const doubleTargets = new Set(
    d.roster
      .filter((r) => r.active_until_episode === null && eliminatedByContestant.get(r.contestant_id) == null)
      .map((r) => r.contestant_id),
  )
  const pickResults = new Map(
    d.breakdown.picks.map((p) => [`${p.episode_id}:${p.contestant_id}`, p]),
  )
  const state = resolveMySeasonState(d.season, d.episodes)

  function openReplay(episode: Episode) {
    if (recapId === episode.id) return
    setRecapParam(episode.id)
  }

  async function acknowledgeResult() {
    if (!d.automaticResult) return
    await api.post(`/seasons/${d.season!.id}/reveal-acknowledgement`, {
      episode_id: d.automaticResult.episode_id,
    })
    d.setAutomaticResult(null)
    setRecapParam(null)
  }

  const visibleResult =
    recapId == null
      ? null
      : recapId === d.automaticResult?.episode_id
        ? d.automaticResult
        : replayResult?.episode_id === recapId
          ? replayResult
          : null
  const recapMode = recapId === d.automaticResult?.episode_id ? 'automatic' : 'replay'

  // What each beat says about itself. All derived — nothing is stored (#396
  // follow-up). Mirrors the markers already inside the sections.
  function beatsFor(openEp: Episode): Beat[] {
    const eliminatedIn = new Map(d.contestants.map((c) => [c.id, c.eliminated_in_episode]))
    const held = d.roster.filter((r) => r.active_until_episode === null)
    // "Active" means still playing, not still holding a slot — a dead slot is
    // exactly what the missing check is telling you to fix.
    const active = held.filter((r) => eliminatedIn.get(r.contestant_id) == null)
    const swappedThisEpisode = d.roster.some(
      (r) => r.active_until_episode === openEp.episode_number - 1,
    )
    const play = d.plays.find((p) => p.episode_id === openEp.id)
    const rosterDouble =
      play?.advantage_type === 'double_roster_points' && play.target_contestant_id != null
    const ballotDouble = play?.advantage_type === 'double_vote_points'

    const stillIn = d.contestants.filter(
      (c) => c.eliminated_in_episode == null || c.eliminated_in_episode >= openEp.episode_number,
    ).length
    const maxPicks = Math.max(0, Math.min(openEp.max_elimination_picks, stillIn - 1))
    const saved = d.openPicks.length

    return [
      {
        key: 'roster',
        label: 'Roster',
        // A roster is settled when no slot is sitting dead — the only job it
        // has between locks.
        done: active.length === held.length,
        doubled: rosterDouble,
        note: `${active.length} active${swappedThisEpisode ? ' · swapped' : ''}`,
      },
      {
        key: 'ballot',
        label: 'Ballot',
        done: maxPicks > 0 && saved === maxPicks,
        doubled: ballotDouble,
        note: saved > 0 ? `${saved} of ${maxPicks}` : 'None',
      },
    ]
  }

  return (
    <>
      <div
        className="mx-auto max-w-2xl space-y-10"
        aria-hidden={visibleResult ? true : undefined}
        inert={visibleResult ? true : undefined}
      >
      {state.kind !== 'open' && (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl md:text-3xl tracking-wide text-forest-800">
              {d.season.name}
            </h1>
            <HeaderPoints standing={d.standing} rank={d.rank} count={d.playerCount} />
          </div>
          {/* The Roster beat carries Episode History in the open state (#478);
              the other states have no beat bar, so it rides here near the top so
              replays stay reachable between and after episodes. */}
          {state.kind !== 'watch_only' && (
            <EpisodeHistorySection
              season={d.season}
              userId={d.userId}
              episodes={d.episodes}
              onReplay={openReplay}
              replayLoading={replayLoading}
              replayError={replayError}
            />
          )}
        </div>
      )}

      {state.kind === 'watch_only' && <WatchOnlyState episode={state.episode} />}

      {state.kind === 'locked' && (
        <LockedState
          episode={state.episode}
          season={d.season}
          contestants={d.contestants}
          userId={d.userId}
          plays={d.plays}
          rosterPoints={rosterPoints}
        />
      )}

      {state.kind === 'open' && (stageOpen || picking === 'swap') && (
        <div
          className="stage-scrim"
          data-on={picking === 'swap'}
          onClick={() => setPicking(null)}
          aria-hidden="true"
        />
      )}

      {state.kind === 'open' && (
        <div className="space-y-3">
        <SeasonRecord glowOut={stageOpen}>
          <RecordHead
            title={d.season.name}
            meta={`Episode ${state.episode.episode_number}`}
            right={<HeaderPoints standing={d.standing} rank={d.rank} count={d.playerCount} />}
          />
          <AdvantagePrompt
            season={d.season}
            episodes={d.episodes}
            contestants={d.contestants}
            plays={d.plays}
            setPlays={d.setPlays}
            doubleTargets={doubleTargets}
            onBeatChange={setBeat}
            onOpenRosterDouble={() => {
              setPicking('double')
              setBeat('roster')
            }}
          />
          <RecordBeats value={beat} onChange={setBeat} beats={beatsFor(state.episode)} />

          <RecordPanel
            beat="roster"
            active={beat === 'roster'}
            className={`stage-stage ${picking === 'swap' ? 'stage-lit' : ''}`}
          >
            <div id="roster">
              <RosterSection
                season={d.season}
                contestants={d.contestants}
                episodes={d.episodes}
                userId={d.userId}
                rosterPoints={rosterPoints}
                plays={d.plays}
                setPlays={d.setPlays}
                onRosterChange={d.bumpRoster}
                rosterVersion={d.rosterVersion}
                picking={picking}
                onPickingDone={() => setPicking(null)}
                onStartSwap={() => setPicking('swap')}
                onBeatChange={setBeat}
                bare
              />
            </div>
          </RecordPanel>

          <RecordPanel beat="ballot" active={beat === 'ballot'}>
            <div id="votes">
              <PicksSection
                season={d.season}
                contestants={d.contestants}
                episodes={d.episodes}
                userId={d.userId}
                plays={d.plays}
                setPlays={d.setPlays}
                pickResults={pickResults}
                onBallotSaved={d.bumpBallot}
                onDragToRoster={() => {
                  // Open the double-pick sheet (as the Advantage → Roster ×2 tap
                  // does) and land you on the Roster beat afterwards (#487).
                  setPicking('double')
                  setBeat('roster')
                }}
                activeOnly
                bare
              />
            </div>
          </RecordPanel>
        </SeasonRecord>
        {/* Below the record, not inside it, and only under the Roster beat
            (#478): a small history affordance that doesn't follow you to the
            Ballot beat. Past Plays rides alongside it now that the Advantage
            beat is gone (#399). */}
        {beat === 'roster' && (
          <PastPlays plays={d.plays} contestants={d.contestants} episodes={d.episodes} />
        )}
        {beat === 'roster' && (
          <EpisodeHistorySection
            season={d.season}
            userId={d.userId}
            episodes={d.episodes}
            onReplay={openReplay}
            replayLoading={replayLoading}
            replayError={replayError}
          />
        )}
        </div>
      )}

      {state.kind === 'intermission' && <IntermissionState />}
      {state.kind === 'complete' && <CompleteState />}

      </div>
      {visibleResult && (
        <EpisodeResultReveal
          result={visibleResult}
          mode={recapMode}
          onContinue={recapMode === 'automatic' ? acknowledgeResult : undefined}
          onClose={recapMode === 'replay' ? () => setRecapParam(null) : undefined}
        />
      )}
    </>
  )
}

function WatchOnlyState({ episode }: { episode: Episode }) {
  return (
    <section className="p-5 bg-forest-50 border border-forest-200 rounded-xl">
      <p className="text-xs font-semibold uppercase tracking-wide text-forest-700 mb-1">
        Episode {episode.episode_number} · watch only
      </p>
      <p className="text-sm text-gray-700">
        Watch the premiere and get a feel for the cast. Rosters and ballots
        open after it is scored.
      </p>
    </section>
  )
}

function IntermissionState() {
  return (
    <section className="p-5 bg-white border border-cream-200 rounded-xl">
      <h2 className="font-display text-xl tracking-wide text-forest-800">Between episodes</h2>
      <p className="text-sm text-gray-600 mt-1">
        You are caught up. The next episode will appear here when it is available.
      </p>
    </section>
  )
}

function CompleteState() {
  return (
    <section className="p-5 bg-white border border-cream-200 rounded-xl">
      <h2 className="font-display text-xl tracking-wide text-forest-800">Season complete</h2>
      <p className="text-sm text-gray-600 mt-1">
        Final standings are settled. Your episode scores and play history remain below.
      </p>
    </section>
  )
}

function LockedState({
  episode,
  season,
  contestants,
  userId,
  plays,
  rosterPoints,
}: {
  episode: Episode
  season: Season
  contestants: Contestant[]
  userId: string
  plays: AdvantagePlay[]
  rosterPoints: Map<string, number>
}) {
  const [picks, setPicks] = useState<EliminationPick[] | null>(null)
  const [roster, setRoster] = useState<RosterPick[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void Promise.all([
      api.get<EliminationPick[]>(`/episodes/${episode.id}/picks/${userId}`),
      api.get<RosterPick[]>(`/seasons/${season.id}/roster/${userId}`),
    ])
      .then(([savedPicks, savedRoster]) => {
        if (!live) return
        setPicks(savedPicks)
        setRoster(savedRoster.filter((pick) => pick.active_until_episode === null))
      })
      .catch((error) => {
        if (live) setLoadError(error instanceof Error ? error.message : 'Failed to load locked decisions')
      })
    return () => {
      live = false
    }
  }, [episode.id, season.id, userId])

  if (loadError) return <p className="text-terracotta-600">{loadError}</p>
  if (picks == null || roster == null) return <PageLoader />

  const contestantMap = new Map(contestants.map((contestant) => [contestant.id, contestant]))
  const played = plays.find((play) => play.episode_id === episode.id)
  const broadcast = isBroadcastWindow(episode)

  return (
    <>
    <section
      aria-labelledby="locked-state-title"
      data-variant={broadcast ? 'broadcast' : 'delayed'}
      className={`overflow-hidden rounded-2xl border p-5 sm:p-6 ${
        broadcast
          ? 'border-white/15 bg-[radial-gradient(circle_at_top_right,rgba(196,84,50,0.18),transparent_35%),linear-gradient(to_bottom,#132e25,#0e1f19)] text-cream-100 shadow-xl ring-1 ring-black/40'
          : 'border-cream-200 bg-white text-gray-900 shadow-sm'
      }`}
    >
      <div>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${broadcast ? 'text-gold-300' : 'text-forest-700'}`}>
            Episode {episode.episode_number} · locked
          </p>
          <h2 id="locked-state-title" className="mt-1 font-display text-3xl tracking-wide">
            {broadcast ? 'Tribal Council' : 'Results are pending'}
          </h2>
        </div>
      </div>

      <div className="mt-8 grid gap-8">
        <div>
          <h3 className={`text-xs font-semibold uppercase tracking-wide ${broadcast ? 'text-white/60' : 'text-gray-500'}`}>
            Roster
          </h3>
          {roster.length > 0 ? <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {roster.map((pick) => {
              const contestant = contestantMap.get(pick.contestant_id)
              return (
                <li key={pick.id} className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${broadcast ? 'border-white/15 bg-black/10' : 'border-cream-200 bg-cream-50'}`}>
                  {/* My Roster behaves the same locked as unlocked (#451): it
                      shows your scores in place, it does not send you to the Cast
                      page. */}
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <ContestantAvatar
                      name={contestant?.name ?? '—'}
                      imageUrl={contestant?.image_url ?? null}
                      tribeColor={contestant?.tribe_color ?? null}
                      tribeName={contestant?.tribe_name ?? null}
                      size="sm"
                    />
                    <span className="truncate font-medium">{contestant?.name ?? '—'}</span>
                  </span>
                  {played?.advantage_type === 'double_roster_points' &&
                    played.target_contestant_id === pick.contestant_id && (
                      <span className="shrink-0">
                        <DoubleBadge size={26} title="Double Roster Points this episode" />
                      </span>
                    )}
                  {(() => {
                    const v = rosterPoints.get(pick.contestant_id)
                    if (v == null) return null
                    const cls = broadcast
                      ? v > 0
                        ? 'text-jade-200'
                        : v < 0
                          ? 'text-terracotta-200'
                          : 'text-white/55'
                      : v > 0
                        ? 'text-jade-700'
                        : v < 0
                          ? 'text-terracotta-500'
                          : 'text-gray-500'
                    return (
                      <span className={`ml-auto shrink-0 text-xs font-semibold tabular-nums ${cls}`}>
                        {v > 0 ? '+' : ''}
                        {v} pts
                      </span>
                    )
                  })()}
                </li>
              )
            })}
          </ul> : <p className={`mt-2 text-sm ${broadcast ? 'text-white/65' : 'text-gray-500'}`}>No active roster was found.</p>}
        </div>

        <div className="tribal-border tribal-border--dim" aria-hidden="true" />
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${broadcast ? 'text-white/60' : 'text-gray-500'}`}>
              Ballot
            </h3>
            {played?.advantage_type === 'double_vote_points' && (
              <DoubleBadge size={24} title="Double Ballot Points this episode" />
            )}
          </div>
          {picks.length > 0 ? (
            <ul className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3">
              {picks.map((pick) => {
                const contestant = contestantMap.get(pick.contestant_id)
                return (
                  <li
                    key={pick.id}
                    className={`min-w-0 flex items-center gap-2 rounded-xl border p-2 text-sm font-medium ${
                      broadcast ? 'border-white/20 bg-white/10' : 'border-cream-200 bg-cream-50'
                    }`}
                  >
                    <ContestantAvatar
                      name={contestant?.name ?? '—'}
                      imageUrl={contestant?.image_url ?? null}
                      tribeColor={contestant?.tribe_color ?? null}
                      tribeName={contestant?.tribe_name ?? null}
                      size="sm"
                    />
                    {contestant?.name ?? '—'}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className={`mt-2 text-sm ${broadcast ? 'text-white/65' : 'text-gray-500'}`}>No ballot was submitted.</p>
          )}
        </div>

        <div className={`rounded-xl px-4 py-3 ${broadcast ? 'bg-black/15 ring-1 ring-white/10' : 'bg-forest-50 ring-1 ring-forest-100'}`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${broadcast ? 'text-gold-300' : 'text-forest-700'}`}>
            {broadcast ? 'Scoring comes next' : 'Awaiting league scoring'}
          </p>
          <p className={`mt-1 text-sm ${broadcast ? 'text-white/75' : 'text-gray-600'}`}>
            Results appear here after Episode {episode.episode_number} is scored.
          </p>
        </div>
      </div>
    </section>

      {/* The league's locked table lives in its own card, one clear step
          removed from your personal roster/ballot above (#490). Everyone's
          choices open at once when the episode locks, so this is the
          watch-along Hub, not a leak. */}
      <LeagueHub
        episodeId={episode.id}
        episodeNumber={episode.episode_number}
        userId={userId}
        broadcast={broadcast}
      />
    </>
  )
}

/**
 * The locked-state league Hub (#490): every player's frozen choices for the
 * airing episode, plus at-a-glance stats. Only reachable once the episode
 * locks, when the whole league's picks are already public.
 */
function LeagueHub({
  episodeId,
  episodeNumber,
  userId,
  broadcast,
}: {
  episodeId: string
  episodeNumber: number
  userId: string
  broadcast: boolean
}) {
  const [entries, setEntries] = useState<HubEntry[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    api
      .get<HubEntry[]>(`/episodes/${episodeId}/hub`)
      .then((rows) => live && setEntries(rows))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [episodeId])

  // Its own card, deliberately lighter than the personal one above so the two
  // read as separate panels — your locked decisions vs. the league's. On the
  // dark broadcast page a light hairline + elevation is what makes the card's
  // edges legible; dark-on-dark borders disappear.
  const card = broadcast
    ? 'border-white/15 bg-white/[0.045] text-cream-100 shadow-xl ring-1 ring-black/40'
    : 'border-cream-200 bg-cream-50 text-gray-900 shadow-sm'
  const shell = (children: React.ReactNode) => (
    <section
      aria-labelledby="league-hub-title"
      className={`mt-5 overflow-hidden rounded-2xl border p-5 sm:p-6 ${card}`}
    >
      <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${broadcast ? 'text-gold-300' : 'text-forest-700'}`}>
        Episode {episodeNumber} · the field
      </p>
      <h2 id="league-hub-title" className="mt-1 font-display text-2xl tracking-wide">
        The League
      </h2>
      {children}
    </section>
  )

  // Non-blocking: the Hub is a nice-to-have on top of your own locked card, so
  // a load failure or empty field just hides it rather than erroring the page.
  if (failed || (entries && entries.length === 0)) return null
  if (entries == null) {
    return shell(
      <p className={`mt-3 text-sm ${broadcast ? 'text-white/65' : 'text-gray-500'}`}>Loading the field…</p>,
    )
  }

  // Consensus boot: most-voted castaways across every ballot.
  const voteCount = new Map<string, { survivor: StandingSurvivor; n: number }>()
  for (const entry of entries) {
    for (const vote of entry.ballot) {
      const seen = voteCount.get(vote.contestant_id)
      if (seen) seen.n += 1
      else voteCount.set(vote.contestant_id, { survivor: vote, n: 1 })
    }
  }
  const topBoots = [...voteCount.values()].sort((a, b) => b.n - a.n).slice(0, 5)

  // Advantage aggregates. Doubles are the only playable advantage now (#307),
  // so we track just the two: how many doubled their ballot, and which
  // castaway drew the most Double Roster Points.
  const doubleBallots = entries.filter((e) => e.advantage_type === 'double_vote_points').length
  const rosterDoubleCount = new Map<string, { survivor: StandingSurvivor; n: number }>()
  for (const e of entries) {
    if (e.advantage_type === 'double_roster_points' && e.advantage_target) {
      const seen = rosterDoubleCount.get(e.advantage_target.contestant_id)
      if (seen) seen.n += 1
      else rosterDoubleCount.set(e.advantage_target.contestant_id, { survivor: e.advantage_target, n: 1 })
    }
  }
  const topRosterDoubles = [...rosterDoubleCount.values()].sort((a, b) => b.n - a.n).slice(0, 4)

  const sub = broadcast ? 'text-white/60' : 'text-gray-500'
  // Tiles sit a step lighter than the card so their edges read: white on the
  // cream card (delayed), a brighter frost on the faint panel (broadcast).
  const chip = broadcast ? 'border-white/15 bg-white/[0.07]' : 'border-cream-200 bg-white'

  return shell(
    <>
      {/* Quick episode stats. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className={`rounded-xl border p-3 ${chip}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Consensus boot</p>
          {topBoots.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {topBoots.map(({ survivor, n }) => (
                <li key={survivor.contestant_id} className="flex items-center gap-2 text-sm">
                  <ContestantAvatar
                    name={survivor.name}
                    imageUrl={survivor.image_url}
                    tribeColor={survivor.tribe_color}
                    tribeName={survivor.tribe_name}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{survivor.name}</span>
                  <span className={`shrink-0 text-xs font-semibold tabular-nums ${sub}`}>
                    {n} {n === 1 ? 'vote' : 'votes'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`mt-2 text-sm ${sub}`}>No votes are in.</p>
          )}
        </div>

        <div className={`rounded-xl border p-3 ${chip}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Advantages</p>
          <dl className="mt-2 space-y-3">
            <div className="flex items-center gap-2">
              <DoubleBadge size={22} title="Double Ballot Points" />
              <dt className="min-w-0 flex-1 truncate text-sm">Double Ballot</dt>
              <dd className={`shrink-0 text-sm font-semibold tabular-nums ${sub}`}>{doubleBallots}</dd>
            </div>
            {topRosterDoubles.length > 0 ? (
              topRosterDoubles.map(({ survivor, n }) => (
                <div key={survivor.contestant_id} className="flex items-center gap-2">
                  <DoubleBadge size={22} title="Double Roster Points" />
                  <ContestantAvatar
                    name={survivor.name}
                    imageUrl={survivor.image_url}
                    tribeColor={survivor.tribe_color}
                    tribeName={survivor.tribe_name}
                    size="sm"
                  />
                  <dt className="min-w-0 flex-1 truncate text-sm font-medium">{survivor.name}</dt>
                  <dd className={`shrink-0 text-sm font-semibold tabular-nums ${sub}`}>×{n}</dd>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2">
                <DoubleBadge size={22} title="Double Roster Points" />
                <dt className={`flex-1 text-sm ${sub}`}>No roster doubles</dt>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* The full field — one collapsible row per player. */}
      <ul className="mt-4 space-y-2">
        {entries.map((entry) => {
          const isMe = entry.user_id === userId
          return (
            <li key={entry.user_id}>
              <details className={`group rounded-xl border ${chip}`}>
                <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {entry.display_name}
                    {isMe && <span className={`ml-1.5 font-normal ${sub}`}>(you)</span>}
                  </span>
                  {/* No idol here: everyone plays an advantage, so a "they
                      played one" mark is redundant. The ×2 inside marks WHERE. */}
                  <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 transition-transform group-open:rotate-180 ${sub}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="grid gap-3 px-3 pb-3">
                  {/* The play lands where it applies: a ballot double on the
                      whole ballot, a roster double on its target castaway. */}
                  <HubCastawayRow
                    label="Ballot"
                    survivors={entry.ballot}
                    sub={sub}
                    empty="No ballot submitted."
                    doubled={entry.advantage_type === 'double_vote_points'}
                  />
                  <HubCastawayRow
                    label="Roster"
                    survivors={entry.roster}
                    sub={sub}
                    empty="No active roster."
                    doubledContestantId={
                      entry.advantage_type === 'double_roster_points'
                        ? (entry.advantage_target?.contestant_id ?? null)
                        : null
                    }
                  />
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </>,
  )
}

/** A compact ×2 mark for where an advantage was played — legible where the
 *  carved idol turns to mush at small sizes (#490). */
function Times2({ title }: { title: string }) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-flex shrink-0 items-center rounded bg-gold-400 px-1 text-[10px] font-bold leading-tight tabular-nums text-forest-950"
    >
      ×2
    </span>
  )
}

function HubCastawayRow({
  label,
  survivors,
  sub,
  empty,
  doubled = false,
  doubledContestantId = null,
}: {
  label: string
  survivors: StandingSurvivor[]
  sub: string
  empty: string
  /** Whole-row double (a doubled ballot): ×2 next to the label. */
  doubled?: boolean
  /** Single-target double (roster points): ×2 on this castaway's chip. */
  doubledContestantId?: string | null
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <p className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>{label}</p>
        {doubled && <Times2 title="Double Ballot Points this episode" />}
      </div>
      {survivors.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {survivors.map((s) => (
            <li key={s.contestant_id} className="flex items-center gap-1.5 text-xs">
              <ContestantAvatar
                name={s.name}
                imageUrl={s.image_url}
                tribeColor={s.tribe_color}
                tribeName={s.tribe_name}
                size="sm"
              />
              <span className="max-w-[7rem] truncate">{s.name}</span>
              {s.contestant_id === doubledContestantId && (
                <Times2 title="Double Roster Points this episode" />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`mt-1 text-xs ${sub}`}>{empty}</p>
      )}
    </div>
  )
}


/**
 * Everything you've already played, tucked out of the way (#307).
 *
 * The token ledger only renders for seasons that actually had one — tokens
 * are retired, but Cagayan/S49/S50 keep a real history and stay readable
 * forever (#170).
 */
function EpisodeHistorySection({
  season,
  userId,
  episodes,
  onReplay,
  replayLoading,
  replayError,
  wrapperClassName = 'flex justify-end',
}: {
  season: Season
  userId: string
  episodes: Episode[]
  onReplay: (episode: Episode) => void
  replayLoading: string | null
  replayError: string | null
  /** Placement varies by host (record beat vs page header), so the caller owns
   *  the trigger's padding/alignment. */
  wrapperClassName?: string
}) {
  const [ledger, setLedger] = useState<TokenLedgerEntry[] | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    api
      .get<TokenLedgerEntry[]>(`/seasons/${season.id}/tokens/${userId}/history`)
      .then((h) => live && setLedger(h))
      .catch(() => live && setLedger([]))
    return () => {
      live = false
    }
  }, [season.id, userId])

  const scoredEpisodes = episodes
    .filter(
      (episode) =>
        episode.status === 'scored' &&
        season.roster_lock_episode != null &&
        episode.episode_number >= season.roster_lock_episode,
    )
    .sort((a, b) => b.episode_number - a.episode_number)
  if (scoredEpisodes.length === 0 && (ledger == null || ledger.length === 0)) return null

  return (
    <>
      {/* A small trigger near the top of the Roster beat (#478): the recap
          replays + retired ledger open in a sheet, not an always-present page
          section. Weekly plays moved to the Advantage beat. */}
      <div className={wrapperClassName}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-forest-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-cream-50 shadow-sm transition-colors hover:bg-forest-700"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 3v5h5" />
          <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
          <path d="M12 7v5l3 2" />
        </svg>
        <span>Episode History</span>
        {scoredEpisodes.length > 0 && (
          <span className="rounded-full bg-forest-800 px-1.5 py-0.5 font-sans text-[9px] font-bold tracking-[0.08em] text-cream-50">
            {scoredEpisodes.length}
          </span>
        )}
      </button>
      </div>

      {open &&
        createPortal(
          <EpisodeHistorySheet
            scoredEpisodes={scoredEpisodes}
            ledger={ledger ?? []}
            onReplay={(episode) => {
              setOpen(false)
              onReplay(episode)
            }}
            replayLoading={replayLoading}
            replayError={replayError}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  )
}

// The recap replays + retired token ledger, in a bottom sheet (#478) matching
// the app's other sheets. Replay closes the sheet; the recap reveal opens over
// the page from MySeasonPage.
function EpisodeHistorySheet({
  scoredEpisodes,
  ledger,
  onReplay,
  replayLoading,
  replayError,
  onClose,
}: {
  scoredEpisodes: Episode[]
  ledger: TokenLedgerEntry[]
  onReplay: (episode: Episode) => void
  replayLoading: string | null
  replayError: string | null
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panelRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="presentation">
      <div className="absolute inset-0 bg-forest-900/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="episode-history-title"
        className="relative mx-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-cream-50 shadow-[0_-8px_40px_rgba(10,22,19,0.35)] outline-none"
      >
        <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-cream-200 bg-cream-100 px-4 py-3">
          <h2
            id="episode-history-title"
            className="font-display text-sm font-semibold uppercase tracking-wide text-forest-800"
          >
            Episode History
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-forest-700 underline underline-offset-2"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {scoredEpisodes.length > 0 && (
            <ul className="space-y-2">
              {scoredEpisodes.map((episode) => (
                <li key={episode.id}>
                  <button
                    type="button"
                    onClick={() => onReplay(episode)}
                    disabled={replayLoading != null}
                    className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-paper-edge bg-cream-100 p-3 text-left transition-colors hover:border-forest-400 hover:bg-forest-50 disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-display text-sm font-semibold uppercase tracking-wide text-forest-800">
                        {episode.is_finale ? 'Finale' : `Episode ${episode.episode_number}`}
                      </span>
                      <span className="block text-xs text-paper-ink-faded">View your scored result</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-forest-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-cream-50">
                      {replayLoading === episode.id ? 'Loading…' : 'Replay'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {replayError && <p role="alert" className="mt-2 text-sm text-terracotta-700">{replayError}</p>}

      {ledger.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Token ledger (retired)
          </p>
          <ul className="space-y-1.5">
            {ledger.map((h, i) => (
              <li
                key={`${h.created_at}:${i}`}
                className="flex items-center justify-between text-sm text-gray-600"
              >
                <span>
                  {h.description ?? h.transaction_type.replace(/_/g, ' ')}
                  {h.episode_number != null && (
                    <span className="text-gray-400"> · Episode {h.episode_number}</span>
                  )}
                </span>
                <span className={h.amount > 0 ? 'text-gray-700' : 'text-gray-500'}>
                  {h.amount > 0 ? '+' : ''}
                  {h.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
        </div>
      </div>
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

// ─── Header points chip ─────────────────────────────────────────────────────

// Compact My Points chip for the page header — total + rank, breakdown behind a
// tap. No winner component (SS double lands inside roster points, #164).
function HeaderPoints({
  standing,
  rank,
  count,
}: {
  standing: StandingEntry | null
  rank: number | null
  count: number
}) {
  const [open, setOpen] = useState(false)
  const total = standing?.total_points ?? 0
  const components = [
    { label: 'Roster', value: standing?.roster_points ?? 0 },
    { label: 'Ballot', value: standing?.elimination_points ?? 0 },
    { label: 'Finale', value: standing?.finale_points ?? 0 },
  ]

  return (
    <div className="relative z-40 shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="header-points rounded-xl border border-forest-700 px-4 py-2 bg-gradient-to-br from-forest-500 to-forest-700 text-cream-100 text-right shadow-md hover:from-forest-600 hover:to-forest-800 transition-colors"
      >
        <div className="text-[11px] font-semibold uppercase tracking-wider text-cream-100/75">
          My Points
        </div>
        <div className="text-2xl font-bold leading-none tabular-nums">{total}</div>
        {rank != null && (
          <div className="text-[11px] text-cream-100/75 mt-0.5">
            {ordinal(rank)} of {count}
          </div>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-cream-200 rounded-xl shadow-lg p-3 z-20">
          <ul className="space-y-1">
            {components.map((c) => (
              <li key={c.label} className="flex justify-between text-sm">
                <span className="text-gray-600">{c.label}</span>
                <span className="font-medium text-gray-900">{c.value}</span>
              </li>
            ))}
            <li className="flex justify-between text-sm border-t border-gray-100 pt-1 mt-1">
              <span className="font-semibold text-gray-700">Total</span>
              <span className="font-bold text-gray-900">{total}</span>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── Roster section ─────────────────────────────────────────────────────────

function Points({ value }: { value: number | undefined }) {
  if (value == null) return null
  const color = value > 0 ? 'text-jade-700' : value < 0 ? 'text-terracotta-500' : 'text-gray-500'
  return (
    <span className={`text-xs font-medium ${color}`}>
      {value > 0 ? '+' : ''}
      {value} pts
    </span>
  )
}

// The weekly advantage (#399): an inset card between the masthead and the beat
// tabs — set apart on the record so it stands out without being a band that
// muddies the beats — and vanishes to a slim confirmation once played. Unplayed
// it explains itself and carries the loud drag/tap idol; played it just says
// what you did, with undo.
function AdvantagePrompt({
  season,
  episodes,
  contestants,
  plays,
  setPlays,
  doubleTargets,
  onBeatChange,
  onOpenRosterDouble,
}: {
  season: Season
  episodes: Episode[]
  contestants: Contestant[]
  plays: AdvantagePlay[]
  setPlays: React.Dispatch<React.SetStateAction<AdvantagePlay[]>>
  // Active roster castaways this episode — the valid Roster ×2 drop targets.
  doubleTargets: Set<string>
  onBeatChange: (beat: BeatKey) => void
  // Open the double-pick sheet on the Roster beat (the Advantage → Roster flow).
  onOpenRosterDouble: () => void
}) {
  const weekly = useWeeklyPlay(season, episodes, plays, setPlays)
  const [menuOpen, setMenuOpen] = useState(false)
  const play = weekly.play

  const { drag, dragging, start } = useSealDrag({
    disabled: weekly.locked || weekly.busy || play != null,
    canDropOn: (id) => id === 'beat:ballot' || id === 'beat:roster' || doubleTargets.has(id),
    onDrop: (id) => {
      const action = resolveDrop('unplayed', id)
      if (action.kind === 'to_ballot') {
        onBeatChange('ballot')
        void weekly.replace('double_vote_points')
      } else if (action.kind === 'to_roster_picking') {
        onOpenRosterDouble()
      } else if (action.kind === 'reassign_roster') {
        onBeatChange('roster')
        void weekly.replace('double_roster_points', action.target)
      }
    },
    // A tap on the idol (no drag) is the non-drag path — reveal the two plays.
    onTap: () => setMenuOpen(true),
  })

  const episode = weekly.openEpisode
  if (!episode || episode.is_finale) return null

  const locked = weekly.locked
  const rosterDouble = play?.advantage_type === 'double_roster_points'
  const targetName =
    rosterDouble && play?.target_contestant_id
      ? (contestants.find((c) => c.id === play.target_contestant_id)?.name ?? null)
      : null

  // ── Played: the prompt is gone; a slim confirmation with undo takes its place.
  if (play) {
    return (
      <div className="m-3 flex items-center gap-3 rounded-xl border border-jade-200 bg-jade-50 px-4 py-2.5 shadow-sm">
        <span className="shrink-0 rotate-[9deg]" aria-hidden="true">
          <DoubleBadge size={26} title="Advantage played" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-paper-ink">
          <span className="font-display text-xs font-bold uppercase tracking-wide text-jade-700">
            Advantage played
          </span>
          {' — '}
          {rosterDouble ? 'Roster ×2' : 'Ballot ×2'}
          {targetName && ` on ${targetName}`}
        </p>
        {weekly.error && <span className="sr-only" role="alert">{weekly.error}</span>}
        {!weekly.locked && (
          <button
            type="button"
            onClick={() => void weekly.takeBack(play)}
            disabled={weekly.busy}
            className="shrink-0 font-display text-xs font-bold uppercase tracking-wide text-forest-700 underline underline-offset-2 disabled:opacity-40"
          >
            Undo
          </button>
        )}
      </div>
    )
  }

  // ── Unplayed: a bold, self-explaining prompt with the loud idol.
  if (locked) {
    return (
      <div className="m-3 flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 shadow-sm">
        <span className="shrink-0 opacity-40 grayscale" aria-hidden="true">
          <DoubleBadge size={26} title="Advantage not played" />
        </span>
        <p className="text-sm text-stone-500">
          <span className="font-display text-xs font-bold uppercase tracking-wide">Weekly advantage</span>
          {' — not played this episode'}
        </p>
      </div>
    )
  }

  return (
    <div
      className="relative m-3 rounded-xl border-2 border-terracotta-300 bg-gradient-to-br from-gold-50 to-terracotta-50 p-4 shadow-sm"
      onKeyDown={(e) => e.key === 'Escape' && setMenuOpen(false)}
    >
      <SealGhost drag={drag} />
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[0.7rem] font-bold uppercase tracking-[0.15em] text-terracotta-700">
            Weekly advantage · Episode {episode.episode_number}
          </p>
          <h2 className="mt-0.5 font-display text-xl font-bold leading-tight text-forest-800">
            Play your ×2
          </h2>
          <p className="mt-1 text-sm leading-snug text-paper-ink/80">
            Drag the idol onto a castaway or your ballot to double points — one play per episode.
          </p>
          <p className="mt-1.5">
            <RuleLink anchor="weekly-play">How the advantage works</RuleLink>
          </p>
        </div>
        <div className="relative shrink-0">
          <button
            type="button"
            onPointerDown={start}
            onClick={(e) => {
              // Keyboard activation only (detail 0); pointer taps come through
              // the drag's onTap so the menu doesn't double-toggle.
              if (e.detail === 0) setMenuOpen((o) => !o)
            }}
            disabled={weekly.busy}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Play your advantage — drag onto a castaway or your ballot, or activate to choose"
            style={{ opacity: dragging ? 0.3 : 1 }}
            className="advantage-nudge inline-flex cursor-grab touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 active:cursor-grabbing disabled:opacity-40"
          >
            <DoubleBadge size={60} title="Your advantage — play it" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
              <div
                role="menu"
                className="absolute right-0 top-full z-20 mt-1.5 w-48 overflow-hidden rounded-lg border border-paper-edge bg-white shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onOpenRosterDouble()
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-paper-ink hover:bg-cream-100"
                >
                  Double a castaway
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onBeatChange('ballot')
                    void weekly.replace('double_vote_points')
                  }}
                  className="block w-full border-t border-paper-line px-3 py-2 text-left text-sm text-paper-ink hover:bg-cream-100"
                >
                  Double your ballot
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {weekly.error && <p className="mt-2 text-xs text-terracotta-600">{weekly.error}</p>}
    </div>
  )
}

// Spent advantages from closed episodes (#478), relocated below the record now
// that the Advantage beat is gone (#399). Hidden until there's history.
function PastPlays({
  plays,
  contestants,
  episodes,
}: {
  plays: AdvantagePlay[]
  contestants: Contestant[]
  episodes: Episode[]
}) {
  const episodeMap = new Map(episodes.map((e) => [e.id, e]))
  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const spent = plays
    .filter((p) => {
      const ep = p.episode_id ? episodeMap.get(p.episode_id) : undefined
      return ep != null && episodeClosed(ep)
    })
    .sort(
      (a, b) =>
        (episodeMap.get(b.episode_id ?? '')?.episode_number ?? 0) -
        (episodeMap.get(a.episode_id ?? '')?.episode_number ?? 0),
    )
  if (spent.length === 0) return null
  return <PastPlaysSection spent={spent} contestantMap={contestantMap} episodeMap={episodeMap} />
}

// A ruled "Past X" sub-section under a record beat (#478) — the shared shell
// for Past Plays (Advantage) and Past Ballots (Ballot). Collapsed by default,
// since it's reference, not the week's decision.
function CollapsibleRecordSection({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-t-2 border-paper-edge">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-baseline gap-2 bg-black/[.025] px-4 pt-2.5 pb-1.5 text-left"
        >
          <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-paper-ink">
            {title}
          </span>
          {count != null && (
            <span className="ml-auto text-[11px] font-semibold text-paper-ink-faded">{count}</span>
          )}
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 text-paper-ink-faded transition-transform ${open ? 'rotate-180' : ''} ${count == null ? 'ml-auto' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </h2>
      {open && children}
    </div>
  )
}

// Your season's spent plays, grouped with the Advantage beat (#478).
function PastPlaysSection({
  spent,
  contestantMap,
  episodeMap,
}: {
  spent: AdvantagePlay[]
  contestantMap: Map<string, Contestant>
  episodeMap: Map<string, Episode>
}) {
  return (
    <CollapsibleRecordSection title="Past Plays" count={spent.length}>
      {spent.map((p) => (
        <RecordLine key={p.id}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-paper-ink">
              {ADV_LABELS[p.advantage_type] ?? p.advantage_type}
              {p.target_contestant_id && (
                <span className="text-paper-ink-faded">
                  {' '}
                  → {contestantMap.get(p.target_contestant_id)?.name ?? '—'}
                </span>
              )}
              <span className="text-paper-ink-faded">
                {' '}
                · Episode {episodeMap.get(p.episode_id ?? '')?.episode_number}
              </span>
            </span>
            {p.points_earned != null && (
              <span
                className={`shrink-0 text-xs ${
                  p.points_earned > 0 ? 'font-medium text-jade-700' : 'text-paper-ink-faded'
                }`}
              >
                {p.points_earned > 0 ? '+' : ''}
                {p.points_earned} pts
              </span>
            )}
          </div>
        </RecordLine>
      ))}
    </CollapsibleRecordSection>
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
  onRosterChange,
  rosterVersion,
  picking = null,
  onPickingDone,
  onStartSwap,
  onBeatChange,
  bare = false,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
  rosterPoints: Map<string, number>
  plays: AdvantagePlay[]
  setPlays: React.Dispatch<React.SetStateAction<AdvantagePlay[]>>
  onRosterChange: () => void
  rosterVersion: number
  /** Roster rows answer the Advantage section's "who do you double?" (#398)
   *  and, since swaps left that economy (#404), the roster's own
   *  "who do you drop?". */
  picking?: 'double' | 'swap' | null
  onPickingDone?: () => void
  onStartSwap?: () => void
  /** Switch the visible beat — used when a seal drag moves the play to the
   *  Ballot beat so its landing is visible (#487). */
  onBeatChange?: (beat: BeatKey) => void
  bare?: boolean
}) {
  const [roster, setRoster] = useState<RosterPick[]>([])
  // Distinct from "loaded but empty": until the fetch lands, an empty roster
  // must not render the "submission window has closed" fallback, which flashed
  // on every refresh mid-season before the roster arrived.
  const [rosterLoaded, setRosterLoaded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Who is holding the stage light, for the beat after being chosen.
  // Second half of a swap: who you tapped to drop, waiting on who replaces them.
  const [dropping, setDropping] = useState<string | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Pre-lock, default to showing just your picks (so you can plan an advantage
  // on one); the full picker opens on Edit (#218).
  const [editing, setEditing] = useState(false)

  // Tap-to-expand per-episode breakdown (#257): lazy-fetch each contestant's
  // performance the first time its card is opened.
  const { expandedId, perfs, toggleExpand } = useRosterBreakdown()

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
      .finally(() => setRosterLoaded(true))
    // rosterVersion: refetch when a sibling section changes the roster (e.g. a
    // Sole Survivor designation) so the SS stamp updates without a reload.
  }, [season.id, userId, rosterVersion])

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

  // Light gold SS outline while the designation window is open, solid once
  // locked (#190).
  const ssOpen = ssDesignationOpen(season, episodes)

  // Double Roster Points target the next open episode's roster scoring (#81),
  // and draw on the same single weekly play as the vote double and paid
  // swaps (#307).
  const weekly = useWeeklyPlay(season, episodes, plays, setPlays)
  const rosterDouble =
    weekly.play?.advantage_type === 'double_roster_points' ? weekly.play : undefined
  // On a successful drop, show the seal on its destination immediately while
  // the delete-and-create request catches up. Without this bridge the server-
  // backed target briefly renders old → none → new, which reads as a snap-back.
  const [pendingDoubleTarget, setPendingDoubleTarget] = useState<string | null>(null)
  const displayedDoubleTarget =
    pendingDoubleTarget ?? rosterDouble?.target_contestant_id ?? null

  // Stamp the seal on the row it just landed on (#487). Fires on any change of
  // target — drag reassign, cross-beat move, a pick — but not on first paint.
  const [stampId, setStampId] = useState<string | null>(null)
  const prevDoubleTarget = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const prev = prevDoubleTarget.current
    prevDoubleTarget.current = displayedDoubleTarget
    if (prev !== undefined && displayedDoubleTarget && displayedDoubleTarget !== prev) {
      setStampId(displayedDoubleTarget)
      const timer = setTimeout(() => setStampId(null), 790)
      return () => clearTimeout(timer)
    }
  }, [displayedDoubleTarget])

  // Drag the ×2 seal onto another castaway to move the play (#407), or up to the
  // Ballot tab to make it a ballot double (#487) — the direct-manipulation twin
  // of the Advantage tap paths, which stay. Both commit through weekly.replace.
  const { drag, dragging, start: startSealDrag } = useSealDrag({
    disabled: weekly.locked || weekly.busy,
    canDropOn: (id) => {
      if (id === 'beat:ballot') return true
      if (id.startsWith('beat:')) return false
      // Any active, still-in castaway that isn't the current target.
      return (
        id !== rosterDouble?.target_contestant_id &&
        activeRoster.some((p) => p.contestant_id === id) &&
        contestantMap.get(id)?.eliminated_in_episode == null
      )
    },
    onDrop: (id) => {
      const action = resolveDrop('roster', id)
      if (action.kind === 'reassign_roster') {
        // Land the in-row seal in the same render that drops the lifted copy;
        // the quiet held treatment is enough feedback while the request catches
        // up, rather than flashing old → none → new.
        setPendingDoubleTarget(action.target)
        void weekly
          .replace('double_roster_points', action.target)
          .finally(() => setPendingDoubleTarget(null))
      } else if (action.kind === 'to_ballot') {
        // Switch to the Ballot beat first so the corner-seal lands in view.
        onBeatChange?.('ballot')
        void weekly.replace('double_vote_points')
      }
    },
  })

  const doubledByContestantEp = doubledByContestantEpisode(plays, episodes)

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

  // The other half of the Advantage section's Swap button (#394): who leaves is
  // a roster decision, so it is made here, on the cards, and commits on the tap
  // that names the replacement. There is no undo — see the Rules page.
  const rosterContestantIds = new Set(roster.map((r) => r.contestant_id))
  const swapCandidates = contestants.filter(
    (c) => !rosterContestantIds.has(c.id) && c.eliminated_in_episode == null,
  )
  // What the next swap costs (#404): the first free_swaps are free, then
  // step * ordinal, floored. Mirrors roster.py — keep in sync.
  const swapOrdinal = swappedRoster.length + 1
  const nextSwapCost =
    swapOrdinal <= season.free_swaps
      ? 0
      : Math.max(season.swap_penalty_step * swapOrdinal, season.swap_penalty_floor)
  // One swap per episode: a swap closes the outgoing pick at openEp - 1.
  const thisEpisodeSwap =
    weekly.openEpisode == null
      ? undefined
      : roster.find((r) => r.active_until_episode === weekly.openEpisode!.episode_number - 1)
  const swappedThisEpisode = thisEpisodeSwap != null
  const swapAvailable =
    season.status !== 'completed' &&
    !swapsLocked(season, episodes) &&
    !swappedThisEpisode &&
    activeRoster.length > 0 &&
    swapCandidates.length > 0

  async function undoSwap() {
    setSwapping(true)
    setError(null)
    try {
      await api.delete(`/seasons/${season.id}/roster/swap`)
      setRoster(await api.get<RosterPick[]>(`/seasons/${season.id}/roster/${userId}`))
      onRosterChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Undo failed')
    } finally {
      setSwapping(false)
    }
  }

  async function commitSwap(newContestantId: string) {
    if (!dropping) return
    setSwapping(true)
    setError(null)
    try {
      await api.post<RosterPick>(`/seasons/${season.id}/roster/swap`, {
        old_contestant_id: dropping,
        new_contestant_id: newContestantId,
      })
      // The roster changed — the weekly play is no longer involved (#404).
      const picks = await api.get<RosterPick[]>(
        `/seasons/${season.id}/roster/${userId}`,
      )
      setRoster(picks)
      onRosterChange()
      setDropping(null)
      onPickingDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap failed')
    } finally {
      setSwapping(false)
    }
  }

  async function submitRoster() {
    setSubmitting(true)
    setError(null)
    try {
      const picks = await api.post<RosterPick[]>(`/seasons/${season.id}/roster`, {
        contestant_ids: [...selected],
      })
      setRoster(picks)
      setEditing(false)
      onRosterChange()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }


  return (
    <>
    <SealGhost drag={drag} />
    <RecordSection
      title="Roster"
      bare={bare}
      right={
        picking === 'swap' ? (
          <button
            type="button"
            onClick={() => {
              setDropping(null)
              onPickingDone?.()
            }}
            className="text-[11px] font-semibold uppercase tracking-wide text-forest-700 underline underline-offset-2"
          >
            Cancel
          </button>
        ) : swapAvailable ? (
          <button
            type="button"
            onClick={() => onStartSwap?.()}
            aria-label={`Swap · ${nextSwapCost === 0 ? 'free' : nextSwapCost}`}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-gold-500 bg-gold-50 px-2.5 py-1 font-display text-sm font-semibold text-forest-700 shadow-sm transition-colors hover:bg-gold-100"
          >
            <span className="tribe-marker bg-gold-500" aria-hidden="true" />
            <span>Roster swap</span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-sans text-[9px] font-bold uppercase tracking-[0.08em] ${
                nextSwapCost === 0
                  ? 'bg-jade-600 text-cream-50'
                  : 'bg-terracotta-100 text-terracotta-800'
              }`}
            >
                              {nextSwapCost === 0 ? 'free' : `${nextSwapCost} pts`}
            </span>
          </button>
        ) : thisEpisodeSwap ? (
          /* Reversible until picks lock — see the swap-undo decision. */
          <span className="inline-flex items-baseline gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-terracotta-700">
              Swapped this episode
              {thisEpisodeSwap.swap_penalty_points !== 0 &&
                ` · ${thisEpisodeSwap.swap_penalty_points}`}
            </span>
            <button
              type="button"
              onClick={() => void undoSwap()}
              disabled={swapping}
              className="text-[11px] font-semibold uppercase tracking-wide text-forest-700 underline underline-offset-2 disabled:opacity-40"
            >
              Undo
            </button>
          </span>
        ) : undefined
      }
    >
      {picking === 'swap' && (
        <p className="border-b border-terracotta-200 bg-terracotta-50/80 px-4 py-2 text-xs font-semibold text-terracotta-800">
          {dropping
            ? `Choose who replaces ${contestantMap.get(dropping)?.name ?? 'them'}`
            : 'Choose a castaway to drop'}
        </p>
      )}
      {picking === 'double' &&
        createPortal(
          <DoublePickSheet
            candidates={[...activeRoster]
              .sort(
                (a, b) =>
                  Number(contestantMap.get(a.contestant_id)?.eliminated_in_episode != null) -
                  Number(contestantMap.get(b.contestant_id)?.eliminated_in_episode != null),
              )
              .map((pick) => {
                const c = contestantMap.get(pick.contestant_id)
                return {
                  contestantId: pick.contestant_id,
                  name: c?.name ?? '—',
                  imageUrl: c?.image_url ?? null,
                  tribeName: c?.tribe_name ?? null,
                  tribeColor: c?.tribe_color ?? null,
                  points: rosterPoints.get(pick.contestant_id),
                  eliminated: c?.eliminated_in_episode != null,
                }
              })}
            onPick={(id) => {
              // Close the sheet now — the seal lands optimistically, so waiting
              // for the delete+post round-trip left the castaway list lingering
              // a beat after the pick already showed (#487).
              onPickingDone?.()
              void weekly.replace('double_roster_points', id)
            }}
            onCancel={() => onPickingDone?.()}
            busy={weekly.busy}
            error={weekly.error}
          />,
          document.body,
        )}
      {error && <p className="text-terracotta-600 text-sm mb-3">{error}</p>}

      {!rosterLoaded ? null : hasRoster && !(windowOpen && editing) ? (
        <div className="space-y-6">
          {windowOpen && (
            <div className="flex items-center justify-between gap-3 -mt-2">
              <p className="text-xs text-gray-500">
                Your roster for episode {season.roster_lock_episode} — plan a weekly play
                below, or edit before it locks.
              </p>
              <button
                onClick={() => {
                  setSelected(new Set(savedContestantIds))
                  setEditing(true)
                }}
                className="shrink-0 text-sm text-forest-600 font-medium hover:text-forest-800"
              >
                Edit
              </button>
            </div>
          )}
          <ul>
            {/* Boots sink to the bottom (#190); stable sort keeps the rest in place.
                Each card's points are what that castaway earned *you*: the
                breakdown folds in Double Roster Points and the Sole Survivor
                finale bonus, so it can differ from their raw cast-page total. */}
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
                isDoubled={displayedDoubleTarget === pick.contestant_id}
                ssWindowOpen={ssOpen}
                swappedInEpisode={
                  pick.active_from_episode > rosterBaseEp ? pick.active_from_episode : null
                }
                right={<Points value={rosterPoints.get(pick.contestant_id)} />}
                bioLink={false}
                onSelect={
                  picking === 'swap' && !swapping
                    ? () => setDropping(pick.contestant_id)
                    : undefined
                }
                selected={
                  picking === 'swap'
                    ? dropping === pick.contestant_id
                    : displayedDoubleTarget === pick.contestant_id
                }
                expanded={expandedId === pick.contestant_id}
                onToggle={() => toggleExpand(pick.contestant_id)}
                // #407: the doubled row's seal is a drag handle (only when not
                // already tap-picking); every row is a drop target for it.
                onSealPointerDown={
                  !picking && displayedDoubleTarget === pick.contestant_id
                    ? startSealDrag
                    : undefined
                }
                sealLifted={
                  dragging && displayedDoubleTarget === pick.contestant_id
                }
                dropId={pick.contestant_id}
                dropActive={drag?.overId === pick.contestant_id}
                stamp={stampId === pick.contestant_id}
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

          {picking === 'swap' && dropping && (
            <div className="space-y-2">
              {/* The price is the mechanic now, so it reads at full strength
                  rather than as faded helper text. */}
              <p className="text-xs text-paper-ink">
                Takes effect this episode and{' '}
                {nextSwapCost === 0 ? (
                  <span className="font-semibold">is free — your first swap of the season</span>
                ) : (
                  <>
                    <span className="font-semibold">costs {nextSwapCost} points</span>, charged to
                    the castaway you drop
                  </>
                )}
                . One swap per episode, and you can undo it until picks lock.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {swapCandidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => void commitSwap(c.id)}
                    disabled={swapping}
                    className="flex items-center gap-2 p-3 rounded-lg border border-cream-200 bg-white text-left text-sm font-medium text-gray-700 hover:border-forest-500 disabled:opacity-40"
                  >
                    <ContestantAvatar
                      name={c.name}
                      imageUrl={c.image_url}
                      size="sm"
                      tribeColor={c.tribe_color}
                      tribeName={c.tribe_name}
                    />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {swappedRoster.length > 0 && (
            <SectionShell title="Swapped Out" defaultOpen={false}>
              <ul className="space-y-2">
                {swappedRoster.map((pick) => {
                  const c = contestantMap.get(pick.contestant_id)
                  return (
                    <li
                      key={pick.id}
                      className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg text-gray-500"
                    >
                      {/* Grey + crossed off, matching Cast/Standings/recap
                          (#457) — no torch. */}
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 grayscale opacity-70">
                          <ContestantAvatar
                            name={c?.name ?? '—'}
                            imageUrl={c?.image_url ?? null}
                            tribeColor={c?.tribe_color ?? null}
                            tribeName={c?.tribe_name ?? null}
                            size="sm"
                          />
                        </span>
                        <span className="line-through decoration-stone-300">{c?.name ?? '—'}</span>
                      </span>
                      <span className="text-xs flex items-center gap-2">
                        <Points value={rosterPoints.get(pick.contestant_id)} />
                        <span>
                          ep {pick.active_from_episode}–{pick.active_until_episode}
                          {pick.swap_penalty_points !== 0 && (
                            <span className="ml-1 text-terracotta-400">· swap {pick.swap_penalty_points}</span>
                          )}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </SectionShell>
          )}

        </div>
      ) : windowOpen ? (
        <div>
          <p className="text-sm text-gray-600 mb-1">
            {hasRoster
              ? `Rearrange your roster freely before episode ${season.roster_lock_episode} — no penalty.`
              : `Choose ${season.roster_size} castaways for your season roster.`}
          </p>
          <p className="text-xs text-gray-500 mb-4">
            {selected.size} / {season.roster_size} selected
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
                      ? 'border-terracotta-300 bg-terracotta-50 text-terracotta-700'
                      : isSelected
                        ? 'border-forest-500 bg-forest-50 text-forest-900'
                        : blocked
                          ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                          : 'border-cream-200 bg-white text-gray-700 hover:border-gray-300',
                  ].join(' ')}
                >
                  <ContestantAvatar name={c.name} imageUrl={c.image_url} size="sm" tribeColor={c.tribe_color} tribeName={c.tribe_name} />
                  <span className={isOut ? 'line-through' : ''}>{c.name}</span>
                  {isOut && (
                    <span className="ml-auto text-[11px] uppercase tracking-wide text-terracotta-500">
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
              className="px-4 py-2 bg-jade-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-jade-700 transition-colors"
            >
              {submitting ? 'Saving…' : hasRoster ? 'Save changes' : 'Lock In Roster'}
            </button>
            {hasRoster && editing && (
              <button
                onClick={() => {
                  setSelected(new Set(savedContestantIds))
                  setEditing(false)
                }}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            )}
            {hasRoster && (
              <span className={`text-xs ${rosterDirty ? 'text-gold-700' : 'text-gray-500'}`}>
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
      {/* Hidden until the merge (#307 follow-up): the designation doubles a
          castaway's FINALE contribution, so picking one in episode 2 is a
          throwaway guess that only clutters the weekly page. It appears the
          week merge_episode is set, and still locks with the advantages. */}
      {season.merge_episode != null && (
        <SoleSurvivorLine
          season={season}
          contestants={contestants}
          episodes={episodes}
          userId={userId}
          rosterVersion={rosterVersion}
          onRosterChange={onRosterChange}
        />
      )}
    </RecordSection>
    </>
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
  activeOnly = false,
  onBallotSaved,
  onDragToRoster,
  bare = false,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
  plays: AdvantagePlay[]
  setPlays: React.Dispatch<React.SetStateAction<AdvantagePlay[]>>
  pickResults: Map<string, PickResult>
  activeOnly?: boolean
  onBallotSaved?: () => void
  /** Drag the ballot ×2 seal onto the Roster tab to move the play there (#487). */
  onDragToRoster?: () => void
  bare?: boolean
}) {
  const [picksByEpisode, setPicksByEpisode] = useState<Map<string, EliminationPick[]>>(new Map())
  const [pending, setPending] = useState<Map<string, Set<string>>>(new Map())
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
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
        if (isEpisodeOpen(ep, season, episodes)) {
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
  const isOpen = (ep: Episode) => isEpisodeOpen(ep, season, episodes)

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
      // The Ballot beat shows the saved count, so it follows the save.
      onBallotSaved?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Submit failed'
      setErrors((prev) => new Map(prev).set(episodeId, msg))
    } finally {
      setSubmitting(null)
    }
  }

  const play = useWeeklyPlay(season, episodes, plays, setPlays)
  // The ballot seal is a drag handle back to roster (#487); its only valid drop
  // is the Roster tab, where you then pick who to double.
  const {
    drag: ballotDrag,
    dragging: ballotDragging,
    start: startBallotDrag,
  } = useSealDrag({
    disabled: play.locked || play.busy,
    canDropOn: (id) => id === 'beat:roster',
    onDrop: (id) => {
      if (resolveDrop('ballot', id).kind === 'to_roster_picking') onDragToRoster?.()
    },
  })
  // Stamp the ballot seal as the double lands on it (#487) — on the flip to
  // doubled, not on first paint.
  const ballotIsDoubled = play.play?.advantage_type === 'double_vote_points'
  const [ballotStamped, setBallotStamped] = useState(false)
  const prevBallotDoubled = useRef<boolean | undefined>(undefined)
  useEffect(() => {
    const prev = prevBallotDoubled.current
    prevBallotDoubled.current = ballotIsDoubled
    if (prev === false && ballotIsDoubled) {
      setBallotStamped(true)
      const timer = setTimeout(() => setBallotStamped(false), 790)
      return () => clearTimeout(timer)
    }
  }, [ballotIsDoubled])
  const nextOpen = episodes.find(isOpen)
  // Watch-only premiere episodes (before roster lock) accept no votes, so they
  // don't belong in "Past Episodes" as "(No votes submitted)" (#82).
  const weekly = episodes.filter(
    (ep) =>
      !ep.is_finale && // finale votes are the finale ballot, not weekly picks (#86)
      ep.episode_number >= (season.roster_lock_episode ?? 1),
  )
  // The episode you're on: open for picks, or locked and awaiting scoring. It
  // renders on its own above the collapsed past ones (#272).
  const currentEp =
    weekly.find(isOpen) ??
    weekly.find((ep) => episodeClosed(ep) && ep.status !== 'scored')
  // Past = actually closed. `!isOpen` would sweep in every FUTURE episode,
  // since only one episode is ever open.
  const closedEpisodes = weekly
    .filter((ep) => episodeClosed(ep) && ep.id !== currentEp?.id)
    .reverse()

  // Shared by the current locked episode and every past row.
  function episodeRow(ep: Episode, current: boolean) {
    const picks = picksByEpisode.get(ep.id) ?? []
    const scored = ep.status === 'scored'
    // The doubled ballot wears the ×2 idol once (#484): a corner-seal stamp on
    // the prominent current ballot, a small inline seal by the episode number on
    // the compact Past Ballots rows. The per-pick earnings chips still name
    // which vote the double paid on.
    const ballotDoubled = plays.some(
      (pl) => pl.episode_id === ep.id && pl.advantage_type === 'double_vote_points',
    )
    const header = (
      <div className="flex items-center gap-2">
        <span className={current ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}>
          Episode {ep.episode_number}
        </span>
        {!current && ballotDoubled && (
          <DoubleBadge size={22} title="Double Ballot Points this episode" />
        )}
        {/* Never show the raw DB status — a locked, unscored episode said
            "upcoming", the opposite of true (#272). */}
        <span
          className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
            scored ? 'bg-jade-50 text-jade-700' : 'bg-gold-50 text-gold-700'
          }`}
        >
          {scored ? 'Scored' : 'Awaiting scoring'}
        </span>
      </div>
    )
    const body =
      picks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {picks.map((p) => {
            const result = pickResults.get(`${ep.id}:${p.contestant_id}`)
            const name = contestantMap.get(p.contestant_id)?.name ?? '—'
            // A ballot-wide double covers every pick (#303); pre-#303 plays
            // named one contestant, so past seasons still pay out per-pick.
            const doubled = plays.some(
              (pl) =>
                pl.episode_id === ep.id &&
                pl.advantage_type === 'double_vote_points' &&
                (pl.target_contestant_id === null ||
                  pl.target_contestant_id === p.contestant_id),
            )
            // Only scored episodes have a settled result. A correct vote gets
            // the CorrectVote pill; incorrect stays neutral, not red — most
            // votes miss and a wall of red feels bad (#53, #135).
            const isCorrect = scored && result?.correct === true
            // Pick chip shows the BASE points; the double's own earnings render
            // as a separate chip beside it (#136).
            const votePoints = result && result.points > 0 ? result.points : undefined
            return (
              <span key={p.id} className="contents">
                {isCorrect ? (
                  <CorrectVote name={name} points={votePoints} />
                ) : (
                  <span className={`inline-flex items-center text-sm px-2 py-1 border rounded-md bg-white border-cream-200 ${scored ? 'text-gray-500' : 'text-gray-700'}`}>
                    {name}
                  </span>
                )}
                {doubled && isCorrect && votePoints != null && (
                  <span className="text-sm px-2 py-1 border rounded-md bg-forest-50 border-forest-200 text-forest-700">
                    Double Ballot Points <span className="font-semibold">+{votePoints}</span>
                  </span>
                )}
              </span>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No votes submitted</p>
      )

    return current ? (
      <div key={ep.id} className="relative mb-6 p-4 bg-white border-2 border-forest-500 rounded-xl">
        {ballotDoubled && <BallotStamp size={48} />}
        {header}
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Ballot locked {formatCentral(ep.picks_lock_at)}
        </p>
        {body}
      </div>
    ) : (
      // Flat record line inside the "Past Ballots" section (#478) — ruled like
      // the rest of the record, not a grey card. The ×2 seal rides in the header.
      <div key={ep.id} className="border-b border-paper-line px-4 py-3 last:border-b-0">
        {header}
        <div className="mt-2">{body}</div>
      </div>
    )
  }

  const content = (
    <>
      <SealGhost drag={ballotDrag} />
      {!currentEp && closedEpisodes.length === 0 && (
        <p className="text-gray-500 text-sm">No episodes yet.</p>
      )}

      {/* Final week: the weekly vote becomes the 3-part finale ballot (#86);
          it stays visible after lock as the stamped ballot (#189). */}
      {(() => {
        const fin = episodes.find((e) => e.is_finale)
        const show = fin && (nextOpen?.id === fin.id || episodeClosed(fin))
        return show ? (
          <FinaleBallot
            season={season}
            contestants={contestants}
            episodes={episodes}
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
          const savedIds = new Set(savedPicks.map((pick) => pick.contestant_id))
          const dirty =
            epPending.size !== savedIds.size ||
            [...epPending].some((contestantId) => !savedIds.has(contestantId))

          // One play per episode (#307); on the ballot it doubles every pick
          // (#303). Extra votes are retired, so the pick limit is the
          // episode's own.
          const ballotDoubled = play.play?.advantage_type === 'double_vote_points'
          // You can never vote for every remaining castaway — cap at
          // (still in the game − 1), even with extra votes (#240).
          const stillIn = contestants.filter(
            (c) =>
              c.eliminated_in_episode == null ||
              c.eliminated_in_episode >= ep.episode_number,
          ).length
          const maxPicks = Math.max(
            0,
            Math.min(ep.max_elimination_picks, stillIn - 1),
          )

          // Only list castaways still in the game, grouped by tribe so the
          // field is easy to scan (#249). Already-eliminated players aren't
          // pickable, so they're hidden entirely rather than shown disabled.
          const byTribe = new Map<string, Contestant[]>()
          for (const c of contestants) {
            if (c.eliminated_in_episode != null && c.eliminated_in_episode < ep.episode_number)
              continue
            const key = c.tribe_name ?? 'No tribe'
            const group = byTribe.get(key)
            if (group) group.push(c)
            else byTribe.set(key, [c])
          }

          return (
            <div className={activeOnly ? 'relative' : 'relative mb-6 rounded-xl border-2 border-forest-500 bg-white p-4'}>
              {ballotDoubled && (
                <BallotStamp
                  onPointerDown={onDragToRoster ? startBallotDrag : undefined}
                  lifted={ballotDragging}
                  stamp={ballotStamped}
                />
              )}
              {!activeOnly && <h3 className="mb-1 font-semibold text-gray-900">Episode {ep.episode_number}</h3>}
              {confirmed ? (
                <div className="mb-5">
                  {/* Submitted is the state people look for, so it gets a mark
                      and the strongest type in the section rather than a line
                      of prose. */}
                  <p className="mb-2 flex items-center gap-1.5 font-display text-base uppercase tracking-wide text-jade-700">
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    Ballot submitted
                  </p>
                  {savedPicks.length < maxPicks && (
                    <p className="text-xs text-jade-700 mb-3">
                      {savedPicks.length} of {maxPicks} votes used — Edit below to add{' '}
                      {maxPicks - savedPicks.length} more before lock.
                    </p>
                  )}
                  <div className="flex flex-wrap items-start gap-3 py-1">
                    {savedPicks.map((p, index) => {
                      const sc = contestantMap.get(p.contestant_id)
                      // Voted-for someone already eliminated earlier — no longer eligible (#5)
                      const stale =
                        sc?.eliminated_in_episode != null &&
                        sc.eliminated_in_episode < ep.episode_number
                      return (
                        <span key={p.id} className="inline-flex items-center gap-1.5">
                          <VoteSlip
                            name={sc?.name ?? '—'}
                            stale={stale}
                            tribeColor={sc?.tribe_color}
                            rotation={[-0.7, 0.5, -0.2][index % 3]}
                          />
                          {stale && <span className="text-[11px] text-gray-500">(out)</span>}
                        </span>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-5 flex items-center justify-between gap-3 border-b border-cream-200 pb-3 text-sm">
                    <span className="text-gray-600">Vote for up to {maxPicks} castaways</span>
                    <span
                      aria-live="polite"
                      className={`shrink-0 font-semibold ${epPending.size === maxPicks ? 'text-jade-700' : 'text-forest-800'}`}
                    >
                      {epPending.size} of {maxPicks} selected
                    </span>
                  </div>
                  <div className="mb-5 space-y-6">
                    {[...byTribe.entries()].map(([tribeName, members]) => (
                      <div key={tribeName}>
                        <div className="mb-3 flex items-center gap-2">
                          {members[0].tribe_color && (
                            <span
                              className="tribe-marker"
                              style={{ backgroundColor: members[0].tribe_color }}
                              aria-hidden="true"
                            />
                          )}
                          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                            {tribeName}
                          </h3>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                          {members.map((c) => {
                            const isSelected = epPending.has(c.id)
                            const maxed = !isSelected && epPending.size >= maxPicks
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => togglePick(ep.id, c.id, maxPicks)}
                                disabled={maxed}
                                aria-pressed={isSelected}
                                aria-label={isSelected ? `Remove vote for ${c.name}` : `Vote for ${c.name}`}
                                className={[
                                  'relative flex min-h-16 min-w-0 items-center gap-2 rounded-xl border p-2 text-left text-sm font-medium transition-all',
                                  isSelected
                                    ? 'border-forest-500 bg-forest-50 text-forest-900 shadow-sm ring-1 ring-forest-200'
                                    : maxed
                                      ? 'border-paper-line bg-black/[.03] text-paper-ink-faded/60 cursor-not-allowed'
                                      : 'border-paper-edge bg-white/55 text-paper-ink hover:border-forest-300',
                                ].join(' ')}
                              >
                                <ContestantAvatar name={c.name} imageUrl={c.image_url} tribeColor={c.tribe_color} tribeName={c.tribe_name} />
                                <span className="min-w-0 leading-tight">{c.name}</span>
                                {isSelected && (
                                  <span className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-forest-600 text-white" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M5 13l4 4L19 7" />
                                    </svg>
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!activeOnly && !play.locked && (
                <div className="mb-4 p-3 bg-forest-50 border border-forest-100 rounded-lg space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-forest-700">
                    Your play · Episode {ep.episode_number}
                  </p>
                  {ballotDoubled ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">
                        Every correct vote scores ×2
                      </span>
                      <button
                        onClick={() => void play.takeBack(play.play!)}
                        disabled={play.busy}
                        className="text-xs text-forest-700 hover:text-forest-900 font-medium"
                      >
                        Take back
                      </button>
                    </div>
                  ) : play.play ? (
                    /* Spent elsewhere — say where, and how to get it back (#307). */
                    <p className="text-sm text-gray-600">
                      {play.play.advantage_type === 'roster_swap'
                        ? 'Your play went on a roster swap this episode.'
                        : `Your play is on ${
                            contestantMap.get(play.play.target_contestant_id ?? '')?.name ??
                            'your roster'
                          } this week — take it back on My Roster to use it here.`}
                    </p>
                  ) : (
                    <button
                      onClick={() => void play.spend('double_vote_points')}
                      disabled={play.busy}
                      className="w-full px-4 py-2 bg-forest-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-forest-700 transition-colors"
                    >
                      Double Ballot Points ×2
                    </button>
                  )}
                  {play.error && <p className="text-terracotta-600 text-xs">{play.error}</p>}
                </div>
              )}

              {episodeError && <p role="alert" className="mb-3 rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-700">{episodeError}</p>}
              {confirmed ? (
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="rounded-lg border border-terracotta-600 px-4 py-2 text-sm font-semibold text-terracotta-700 transition-colors hover:bg-terracotta-50 hover:text-terracotta-800"
                  >
                    Edit ballot
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => submitPicks(ep.id)}
                    disabled={submitting === ep.id || epPending.size === 0 || !dirty}
                    className="min-h-11 flex-1 rounded-lg bg-jade-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-jade-700 disabled:opacity-40"
                  >
                    {submitting === ep.id ? (
                      'Saving…'
                    ) : (
                      <span className="inline-flex items-center justify-center gap-2">
                        Save ballot
                      </span>
                    )}
                  </button>
                  {hasSavedPicks && (
                    <button
                      type="button"
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

      {currentEp && !isOpen(currentEp) && episodeRow(currentEp, true)}
    </>
  )

  if (activeOnly) {
    return (
      <RecordSection
        title="Ballot"
        bare={bare}
        right={nextOpen && <LockBadge lockAt={nextOpen.picks_lock_at} />}
      >
        <div className="px-4 py-3">
          <p className="mb-3 text-sm text-paper-ink-faded">
            Vote for the castaways you think will be eliminated.
          </p>
          {content}
        </div>

        {closedEpisodes.length > 0 && (
          <CollapsibleRecordSection title="Past Ballots" count={closedEpisodes.length}>
            {closedEpisodes.map((ep) => episodeRow(ep, false))}
          </CollapsibleRecordSection>
        )}
      </RecordSection>
    )
  }

  return (
    <SectionShell
      title="Episode Ballots"
      prominent
      collapsible={false}
      right={nextOpen && <LockBadge lockAt={nextOpen.picks_lock_at} />}
    >
      {content}
    </SectionShell>
  )
}

// ─── Finale ballot (final week's weekly vote) ───────────────────────────────

function FinaleBallot({
  season,
  contestants,
  episodes,
  finaleEp,
  userId,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
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

  const locked = !isEpisodeOpen(finaleEp, season, episodes)

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
    <div className="mb-6 p-4 bg-white border border-cream-200 rounded-xl">
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
        <div className="mt-2 p-5 bg-jade-50 border-2 border-jade-500 rounded-xl text-center">
          <div className="flex justify-center mb-1"><VoteMark className="w-10 h-10" /></div>
          <p className="font-semibold text-jade-800 mb-3">
            {locked ? 'Finale ballot locked' : 'Finale ballot in'}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {picks.map(({ id, label, value }) => (
              <span
                key={id}
                className="text-sm px-3 py-1.5 bg-white border border-jade-200 rounded-lg text-left"
              >
                <span className="block text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
                  {label}
                </span>
                <span className="font-medium text-gray-800">
                  {value ? nameOf(value) : 'No prediction'}
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
              className="mt-4 px-4 py-1.5 text-sm font-medium text-jade-800 bg-white border border-jade-300 rounded-lg hover:bg-jade-100 transition-colors"
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
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 border-l-2 border-terracotta-500 pl-2 mb-0.5">
                  {label}
                </label>
                <p className="text-xs text-gray-500 mb-1.5">{description}</p>
                <select
                  value={value}
                  onChange={(e) => {
                    onChange(e.target.value)
                    setSaved(false)
                  }}
                  className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">No prediction</option>
                  {alive.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {error && <p className="text-terracotta-600 text-sm mb-3">{error}</p>}
          {saved && <p className="text-jade-600 text-sm mb-3">Ballot saved.</p>}

          <button
            onClick={() => void submitBallot()}
            disabled={submitting}
            className="w-full px-4 py-2.5 bg-jade-600 text-white text-sm font-semibold rounded-lg disabled:opacity-40 hover:bg-jade-700 transition-colors"
          >
            {submitting ? (
              'Saving…'
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <VoteMark className="w-5 h-5" /> Lock In Finale Ballot
              </span>
            )}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Sole Survivor line (#164) ──────────────────────────────────────────────
//
// Lives inside My Roster rather than owning a section: it's one designation
// and one sentence, and it only ever concerns a castaway already listed above.

function SoleSurvivorLine({
  season,
  contestants,
  episodes,
  userId,
  rosterVersion,
  onRosterChange,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
  rosterVersion: number
  onRosterChange: () => void
}) {
  const [roster, setRoster] = useState<RosterPick[]>([])
  const [choice, setChoice] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refetch when the roster changes (rosterVersion) so a pre-lock swap can't
  // leave a removed castaway designated or hide the new pick (#180 follow-up).
  useEffect(() => {
    api
      .get<RosterPick[]>(`/seasons/${season.id}/roster/${userId}`)
      .then((picks) => {
        setRoster(picks)
        const current = picks.find((p) => p.is_sole_survivor)
        setChoice(current ? current.contestant_id : '')
      })
      .catch(() => setRoster([]))
  }, [season.id, userId, rosterVersion])

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
      onRosterChange() // refresh the roster section so the SS stamp moves (#no-reload)
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Designation failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 pt-3 border-t border-cream-100">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Sole Survivor
        </span>
        {lockEpisode && (
          <LockBadge
            lockAt={lockEpisode.picks_lock_at}
            scored={lockEpisode.status === 'scored'}
          />
        )}
      </div>
      <p className="text-xs text-gray-500 mb-2">
        Your Sole Survivor&apos;s entire finale-episode roster contribution is doubled.
      </p>
      <p className="mb-2"><RuleLink anchor="finale">Sole Survivor rules</RuleLink></p>
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
          <p className="text-xs text-gray-500 mb-3">
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
              aria-label="Sole Survivor"
              className="flex-1 min-w-0 border border-cream-200 rounded-lg px-3 py-2 text-sm"
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
              className="px-4 py-2 bg-forest-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-forest-700 transition-colors"
            >
              {saving ? 'Saving…' : 'Designate'}
            </button>
          </div>
          {error && <p className="text-terracotta-600 text-sm mt-2">{error}</p>}
          {saved && <p className="text-jade-600 text-sm mt-2">Designated.</p>}
        </>
      )}
    </div>
  )
}
