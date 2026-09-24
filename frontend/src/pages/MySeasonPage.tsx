import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router'
import { LOADER_DELAY_MS, PageLoader } from '../components/PageLoader'
import { ADV_LABELS } from '../lib/advantages'
import { activeSeason, api } from '../lib/api'
import { pathQuery, useApiMutation } from '../lib/queries'
import { displayName, isMerged } from '../lib/cast'
import { isBroadcastWindow, resolveMySeasonState } from '../lib/mySeasonState'
import { ContestantAvatar, ELIMINATED_STRIKE } from '../components/ContestantAvatar'
import { FinaleBracket, type FinaleActuals } from '../components/FinaleBracket'
import { EpisodeResultReveal } from '../components/EpisodeResultReveal'
import { LockBadge, LockLine } from '../components/LockBadge'
import { Notice } from '../components/Notice'
import { advantagesLocked, advantagesOpenYet, episodeClosed, isEpisodeOpen, openEpisode, ssDesignationOpen, swapLockEpisodeNumber, swapsLocked } from '../lib/episodes'
import { EpisodeLabel } from '../components/EpisodeLabel'
import { ColdStart } from '../components/ColdStart'
import { RosterBreakdown } from '../components/RosterBreakdown'
import {
  doubledByContestantEpisode,
  EMPTY_EP_MAP,
  useRosterBreakdown,
} from '../lib/rosterBreakdown'
import { RosterCard } from '../components/RosterCard'
import { CorrectVote } from '../components/CorrectVote'
import { AdvantageStamp, DoubleBadge } from '../components/DoubleBadge'
import { HubBallotMark } from '../components/HubPlayMarks'
import { RuleLink } from '../components/RuleLink'
import type { Beat, BeatKey } from '../components/SeasonRecord'
import { LaneStack, RecordBeats, RecordPanel } from '../components/SeasonRecord'
import { HeroLane, HeroPoints, ThisWeekHero } from '../components/ThisWeekHero'
import { SEAL_LIFT_Y, useSealDrag } from '../lib/sealDrag'
import { ChevronRightIcon, HistoryIcon } from '../components/icons'
import { VoteMark } from '../components/VoteMark'
import { VoteSlip } from '../components/VoteSlip'
import { SoleSurvivorExample } from '../components/SoleSurvivorExample'
import { SoleSurvivorTorch } from '../components/SoleSurvivorTorch'
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
  RulesResponse,
  ScoringBreakdown,
  Season,
  StandingEntry,
  StandingSurvivor,
} from '../types'

// The ballot's weekly play is Power Vote (#673): one extra vote, and the
// ×2 sits on whichever of your names you put it on. On a locked ballot the
// carved idol is stamped once on the corner as the play's mark (#484); on the
// open ballot it rides the doubled name. Corner press: the host container
// must be `relative`.
// Bumped on every MySeasonPage mount so a curtain poll left running by a
// previous unmount can tell it has been superseded. Module scope rather than a
// ref: a genuine remount gets a fresh ref, which is the very case that has to
// cancel the old poll.
let roomGeneration = 0

function BallotStamp({ size = 54 }: { size?: number }) {
  return (
    <span
      title="Power Vote this episode"
      className="pointer-events-none absolute -top-3 right-1 z-20 rotate-[11deg] drop-shadow-[0_3px_4px_rgb(28_25_23_/_0.34)]"
    >
      <DoubleBadge size={size} title="Power Vote this episode" />
    </span>
  )
}

/** The idol lifted off the page, following the finger during a drag (#487).
 *  Peels up on grab and springs back to the grab point on a missed drop; both
 *  are gated on prefers-reduced-motion in CSS. */
function SealGhost({
  drag,
  label,
}: {
  drag: { x: number; y: number; releasing?: boolean } | null
  /** A name in flight (a ladder slip) rather than the idol. */
  label?: string
}) {
  if (!drag) return null
  // Float the idol above the finger, not under it: on a phone the thumb covers
  // the drop point, so a seal sitting there is invisible.
  return createPortal(
    <div
      aria-hidden
      className={`seal-ghost pointer-events-none fixed z-50 ${drag.releasing ? 'seal-ghost--releasing' : ''}`}
      style={{ left: drag.x, top: drag.y, transform: `translate(-50%, calc(-50% - ${SEAL_LIFT_Y}px))` }}
    >
      <span className="seal-ghost-inner block" style={{ filter: 'drop-shadow(0 8px 12px rgb(0 0 0 / 45%))' }}>
        {label ? <span className="ballot-slip bg-paper">{label}</span> : <DoubleBadge size={44} />}
      </span>
    </div>,
    document.body,
  )
}

const EMPTY_BREAKDOWN: ScoringBreakdown = {
  roster: [],
  picks: [],
  sole_survivor_contestant_id: null,
  sole_survivor_bonus: 0,
}

// My Tribe (roster) and My Votes are separate tabs (#IA split) but share these
// season sections + the one data load, so both pages live in this file.
function useMySeasonData() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const client = useQueryClient()

  // The league-season this page plays, latched by id the first time the list
  // lands rather than re-derived per render (#816). `activeSeason` follows the
  // pinned choice and the "first active" rule, and both can move underneath a
  // page that writes a roster, a ballot and a play against the season it
  // loaded — a season completed while you are on it would re-point them.
  const seasonsQ = useQuery({
    ...pathQuery<Season[]>('/league-seasons'),
    enabled: userId != null,
  })
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const season = seasonsQ.data?.find((s) => s.id === seasonId) ?? null
  useEffect(() => {
    // `season` too, not just the id: an id that no longer names a row in the
    // list re-derives rather than stranding the page on the cold start.
    if ((seasonId && season) || !seasonsQ.data) return
    setSeasonId(activeSeason(seasonsQ.data)?.id ?? null)
  }, [seasonId, season, seasonsQ.data])

  const showId = season?.season_id
  const own = season && userId ? `/league-seasons/${season.id}` : null
  const contestantsQ = useQuery(
    pathQuery<Contestant[]>(showId ? `/seasons/${showId}/contestants` : null),
  )
  const episodesQ = useQuery(pathQuery<Episode[]>(showId ? `/seasons/${showId}/episodes` : null))
  const standingsQ = useQuery(pathQuery<StandingEntry[]>(own && `${own}/standings`))
  const breakdownQ = useQuery(
    pathQuery<ScoringBreakdown>(own && `${own}/scoring-breakdown/${userId}`),
  )
  const playsPath = own && `${own}/advantage-plays/${userId}`
  const playsQ = useQuery(pathQuery<AdvantagePlay[]>(playsPath))
  const revealPath = own && `${own}/reveal`
  const revealQ = useQuery({
    ...pathQuery<EpisodeResult | null>(revealPath),
    // 204 when there is nothing unseen, and a query may not resolve to
    // undefined — that is v5's "did you forget to return" error.
    queryFn: async () => (await api.get<EpisodeResult | null>(revealPath as string)) ?? null,
  })

  // The beat bar summarises all three sections at once, so the page reads the
  // roster and this episode's ballot even though the sections read their own —
  // the same paths, so the query cache serves one request for all of them.
  const episodes = episodesQ.data ?? []
  const rosterQ = useQuery(pathQuery<RosterPick[]>(own && `${own}/roster/${userId}`))
  const openEp = season ? openEpisode(episodes, season) : undefined
  const openPicksPath = own && openEp ? `${own}/episodes/${openEp.id}/picks/${userId}` : null
  const openPicksQ = useQuery(pathQuery<EliminationPick[]>(openPicksPath))

  // An optimistic play or ballot lands in the cache rather than in a second
  // copy of it, so the hero, the roster and the ballot all move together and
  // the write's own invalidate is what reconciles them (#487).
  const setPlays = useCallback<React.Dispatch<React.SetStateAction<AdvantagePlay[]>>>(
    (update) => {
      if (!playsPath) return
      client.setQueryData<AdvantagePlay[]>(['api', playsPath], (prev) =>
        typeof update === 'function' ? update(prev ?? []) : update,
      )
    },
    [client, playsPath],
  )
  const setOpenPicks = useCallback(
    (picks: EliminationPick[]) => {
      if (openPicksPath) client.setQueryData(['api', openPicksPath], picks)
    },
    [client, openPicksPath],
  )

  const standings = standingsQ.data ?? []
  // Standings come back rank-ordered, so the user's index is their rank.
  const idx = standings.findIndex((s) => s.user_id === userId)

  return {
    userId,
    // A failed roster or ballot read draws the section empty rather than
    // erroring the page, exactly as their `.catch` did.
    roster: rosterQ.data ?? [],
    openPicks: openPicksQ.data ?? [],
    setOpenPicks,
    season,
    contestants: contestantsQ.data ?? [],
    episodes,
    standing: standings.find((s) => s.user_id === userId) ?? null,
    breakdown: breakdownQ.data ?? EMPTY_BREAKDOWN,
    plays: playsQ.data ?? [],
    setPlays,
    rank: idx >= 0 ? idx + 1 : null,
    playerCount: standings.length,
    // The hero's headline and colour are computed from the roster and this
    // episode's ballot, so both are part of the load: with an empty roster and
    // no ballot the week reads as owed, and the page used to open on "your
    // ballot and tribe both need you" and correct itself a moment later.
    //
    // The rule for which side of a gate a read sits on: a read whose refusal
    // is forgiven gates on "has it answered", one whose refusal reaches the
    // error gate below gates on "is it pending".
    //
    // Because a refetch of a query holding no data resets it to pending
    // (query-core's `fetchState`), and an errored query is always stale, so a
    // window focus or any write refetches it. For a forgiven read that reset
    // is a loop: the roster's error opens this gate, the Tribe lane mounts,
    // its mount refetches the stale error, the refetch turns the term here
    // back to pending, the lane unmounts, and round again at round-trip speed.
    // `isFetched` counts answers, and a refusal is an answer — the same thing
    // the `.finally` that set `rosterFor` meant. For the rest `isPending` is
    // the honest one: they show the error, and their reset should read as the
    // loader rather than flash a live page drawn on an empty cast.
    loading:
      seasonsQ.isPending ||
      // The one render between the list landing and the latch above.
      ((seasonsQ.data?.length ?? 0) > 0 && seasonId == null) ||
      (season != null &&
        (contestantsQ.isPending ||
          episodesQ.isPending ||
          standingsQ.isPending ||
          breakdownQ.isPending ||
          playsQ.isPending ||
          revealQ.isPending ||
          !rosterQ.isFetched ||
          (openEp != null && !openPicksQ.isFetched))),
    error:
      seasonsQ.error ??
      contestantsQ.error ??
      episodesQ.error ??
      standingsQ.error ??
      breakdownQ.error ??
      playsQ.error ??
      revealQ.error,
    automaticResult: revealQ.data ?? null,
    revealPath,
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
  userId: string,
) {
  const ep = openEpisode(episodes, season)
  const play = ep ? plays.find((p) => p.episode_id === ep.id) : undefined
  // Locked once past the finale cutoff, or not open yet during the watch-only
  // premiere (RosterSection also renders then, so its band must stay hidden).
  const locked = ep ? advantagesLocked(ep, season) || !advantagesOpenYet(season, episodes) : true

  // A play writes the ballot as well as the play: the Power Vote's name is a
  // pick, and taking it back removes it and closes the ladder up
  // (advantage_plays.py). Both are named here, once, after the whole write —
  // a blanket invalidate would fire between the delete and the post of a move
  // and snap the idol back to the row it just left (#487).
  const own = `/league-seasons/${season.id}`
  const invalidates = [
    `${own}/advantage-plays/${userId}`,
    `${own}/picks/${userId}`,
    ...(ep ? [`${own}/episodes/${ep.id}/picks/${userId}`] : []),
  ]

  const takeBackM = useApiMutation({
    write: (target: AdvantagePlay) => api.quiet.delete(`/advantage-plays/${target.id}`),
    invalidates,
    onSuccess: (_result, target) => setPlays((prev) => prev.filter((p) => p.id !== target.id)),
  })

  const replaceM = useApiMutation({
    write: async (vars: { advantageType: string; targetContestantId?: string; priorId?: string }) => {
      if (vars.priorId) await api.quiet.delete(`/advantage-plays/${vars.priorId}`)
      return api.quiet.post<AdvantagePlay>(`${own}/advantage-plays`, {
        advantage_type: vars.advantageType,
        target_contestant_id: vars.targetContestantId ?? null,
      })
    },
    invalidates,
    onSuccess: (created, vars) =>
      setPlays((prev) => [
        ...prev.filter((p) => p.id !== vars.priorId && !p.id.startsWith('pending-')),
        created,
      ]),
  })

  function takeBack(target: AdvantagePlay) {
    takeBackM.mutate(target)
  }

  /** Play the week's advantage, or swap the current one for another. */
  function replace(advantageType: string, targetContestantId?: string) {
    if (!ep) return
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
    replaceM.mutate(
      { advantageType, targetContestantId, priorId: play?.id },
      {
        // Take the optimistic entry away and no more. A mutate-level callback
        // runs *after* the awaited refetch above, so the plays on screen are
        // already the server's — putting the prior play back here would
        // re-insert one a half-failed move (delete through, post refused) has
        // deleted, leaving an Undo that answers "Advantage not found".
        onError: () => setPlays((prev) => prev.filter((p) => p.id !== optimistic.id)),
      },
    )
  }

  return {
    openEpisode: ep,
    play,
    locked,
    busy: takeBackM.isPending || replaceM.isPending,
    error: takeBackM.error?.message ?? replaceM.error?.message ?? null,
    takeBack,
    replace,
  }
}

export function MySeasonPage() {
  const d = useMySeasonData()
  // Doubling and swapping are both bought in Advantage and answered on the
  // roster (#394), so the mode has to be visible to the button that starts it
  // and the rows that answer it.
  const [picking, setPicking] = useState<'double' | 'swap' | 'sole-survivor' | null>(null)
  // Live finale-ballot progress, reported up from the FinaleBallot as you build
  // the bracket, so the hero reflects picks the instant you make or remove them
  // — the saved ballot on its own can't (#86 follow-on).
  const [finaleProgress, setFinaleProgress] = useState<{
    filled: number
    saved: boolean
  } | null>(null)
  // The Tribe lane's Swap chip lands here, under the card (callback ref so
  // the portal re-targets when the slot mounts and unmounts with the beat).
  const [swapSlot, setSwapSlot] = useState<HTMLDivElement | null>(null)
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
  // Lags the room light on the way out only, by the scrim's 1400ms fade. Drop
  // the lane under the scrim the instant the mode ends and its tabs and frame
  // go dark in one frame, then swell back up: the click after a pick (#826).
  const [laneLit, setLaneLit] = useState(false)
  // Tribal Council is the one thing on this page you do alone and in the dark,
  // so the Ballot beat borrows the swap picker's stage lighting: the room goes
  // down, the lane keeps the torch. Leaving the beat — or the page — brings it
  // back up, since the scrim only exists while this beat is showing.
  // Only while the ballot is being worked on: a submitted, tidy ballot sits
  // in ordinary light (#694 review).
  const [ballotWorking, setBallotWorking] = useState(true)
  const ballotLit = beat === 'ballot' && picking == null && ballotWorking
  // Every pick — double, swap, or Sole Survivor — is answered on the roster, so
  // they all borrow the ballot's lamp swung over to it: the room goes down and
  // the Tribe lane is the one thing left lit. Swap and SS used to get a flat
  // scrim instead, which flashed the field dark on the way in (#164 follow-up).
  const rosterLit = picking != null
  const roomLit = ballotLit || rosterLit
  const litPanel = rosterLit ? 'panel-roster' : 'panel-ballot'
  // Aim the lamp at the ballot. Reads the panel by id rather than threading a
  // ref through LaneStack and RecordPanel — the id is already there for aria,
  // and this is the only thing that needs the box. Tracks the panel's VISIBLE
  // centre, so a long field of castaways stays lit as you scroll it instead of
  // the light drifting off the top.
  // On <html>, not in the page: leaving for Standings or Cast unmounts this
  // page, and a room light that lived here would be cut off mid-dark instead
  // of coming back up behind you.
  useEffect(() => {
    document.documentElement.classList.toggle('ballot-room', roomLit)
  }, [roomLit])

  useEffect(() => {
    if (roomLit) {
      setLaneLit(true)
      return
    }
    const timer = window.setTimeout(() => setLaneLit(false), 1400)
    return () => window.clearTimeout(timer)
  }, [roomLit])

  // Leaving the page is not the same as leaving the beat. Empty deps, so this
  // cleanup runs on unmount only. A beat switch keeps the slow swell — the
  // lane is lit and in front of you the whole time. Leaving the page instead
  // holds the dark as a curtain until the destination has actually landed,
  // then lifts quickly: otherwise the next page arrives underneath the light
  // and sits there invisible while the fade plays out.
  useEffect(() => {
    const root = document.documentElement
    const generation = ++roomGeneration
    root.classList.remove('ballot-room--leaving')
    return () => {
      // Leaving from any other beat never turned the light on, so there is
      // nothing to put away and no reason to strand a class on <html>.
      if (!root.classList.contains('ballot-room')) return
      root.classList.add('ballot-room--leaving')
      // The destination mounts in this same commit, so its PageLoader has not
      // flagged <html> yet — start looking on the next frame. Held no longer
      // than the loader's own delay: past that the puzzle loader is about to
      // appear, and it should appear in the light rather than behind a
      // curtain that is no longer covering anything.
      // ponytail: a 100ms poll rather than a MutationObserver — this is a
      // curtain, not a scrubber, and the cap means it cannot hang.
      let waited = 0
      // This chain outlives the component — it holds <html>, not the page — so
      // every step checks it has not been superseded. Without that, coming
      // back inside the hold window (or StrictMode's mount/unmount/mount in
      // dev, which is not a race but the normal path) leaves a poll that
      // strips `ballot-room` out from under a light that is legitimately on
      // again, with nothing left to turn it back.
      const superseded = () => generation !== roomGeneration
      const lift = () => {
        if (superseded()) return
        root.classList.remove('ballot-room')
        window.setTimeout(() => {
          if (!superseded()) root.classList.remove('ballot-room--leaving')
        }, 600)
      }
      const tick = () => {
        if (superseded()) return
        if (waited < LOADER_DELAY_MS && root.classList.contains('page-loading')) {
          waited += 100
          window.setTimeout(tick, 100)
          return
        }
        lift()
      }
      requestAnimationFrame(tick)
    }
  }, [])

  useEffect(() => {
    if (!roomLit) return
    const panel = document.getElementById(litPanel)
    if (!panel) return
    let frame = 0
    const aim = () => {
      frame = 0
      const box = panel.getBoundingClientRect()
      const top = Math.max(box.top, 0)
      const bottom = Math.min(box.bottom, window.innerHeight)
      document.documentElement.style.setProperty(
        '--stage-light-y',
        `${(top + bottom) / 2}px`,
      )
    }
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(aim)
    }
    aim()
    // Scrolling moves the panel without resizing it; "Edit ballot" swaps three
    // slips for a grid of eighteen castaways, resizing it by hundreds of
    // pixels without scrolling. Both have to re-aim the lamp, so both are
    // watched.
    // `--stage-light-y` is deliberately NOT cleared on the way out: the fade
    // runs for up to 1400ms after this effect tears down, and removing the
    // property mid-fade snaps the lamp to the middle of the screen as it dims.
    // It is inert once the room is off.
    const observer = new ResizeObserver(queue)
    observer.observe(panel)
    window.addEventListener('scroll', queue, { passive: true })
    window.addEventListener('resize', queue)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', queue)
      window.removeEventListener('resize', queue)
    }
  }, [roomLit, litPanel])
  // The recap overlay is driven by a `recap=<episode_id>` URL param (#479) so
  // Back closes it instead of leaving the page, and a refresh restores it.
  const [searchParams, setSearchParams] = useSearchParams()
  const recapId = searchParams.get('recap')
  const [replayError, setReplayError] = useState<string | null>(null)
  // Held a render behind the recap param so paging to a neighbour swaps the
  // card in place instead of unmounting and replaying the enter animation.
  const [displayResult, setDisplayResult] = useState<EpisodeResult | null>(null)
  // The Sole Survivor moment waits its turn behind the first-loss one (#798);
  // RosterSection says when that's settled.
  const [swapMomentPending, setSwapMomentPending] = useState(true)

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

  // What the recap shows comes from the URL param alone: absent closes it,
  // matching the automatic result shows that (no read needed), otherwise the
  // replay for that episode is read here — and kept, so paging to a neighbour
  // and back doesn't ask again.
  const replayPath =
    d.season && recapId && recapId !== d.automaticResult?.episode_id
      ? `/league-seasons/${d.season.id}/episode-results/${recapId}`
      : null
  const replayQ = useQuery(pathQuery<EpisodeResult>(replayPath))
  const replayResult = replayQ.data ?? null
  const replayLoading = replayPath && replayQ.isPending ? recapId : null
  // A recap that can't be read closes rather than sitting empty; its message
  // stays on the History sheet it was opened from.
  useEffect(() => {
    if (!replayQ.error) return
    setReplayError(replayQ.error.message)
    setRecapParam(null)
  }, [replayQ.error, setRecapParam])

  // Acknowledging a reveal changes nothing else on the page: the card is
  // dismissed for good, and `/reveal` answers with the next unseen result or
  // with nothing (#816). Closing is immediate — the refetch only confirms it.
  const acknowledge = useApiMutation({
    write: ({ leagueSeasonId, episodeId }: { leagueSeasonId: string; episodeId: string }) =>
      api.quiet.post(`/league-seasons/${leagueSeasonId}/reveal-acknowledgement`, {
        episode_id: episodeId,
      }),
    invalidates: d.revealPath ? [d.revealPath] : [],
    onSuccess: () => setRecapParam(null),
  })

  // What the recap should show for the current param: the fresh automatic
  // result, or the fetched replay once it matches.
  const revealResult =
    recapId == null
      ? null
      : recapId === d.automaticResult?.episode_id
        ? d.automaticResult
        : replayResult?.episode_id === recapId
          ? replayResult
          : null
  const recapMode = recapId === d.automaticResult?.episode_id ? 'automatic' : 'replay'
  useEffect(() => {
    if (recapId == null) setDisplayResult(null)
    else if (revealResult) setDisplayResult(revealResult)
  }, [recapId, revealResult])

  useEffect(() => {
    // Swap and Sole Survivor let the chosen card's halo out of the lane while
    // picking; hold the overflow open a beat past the pick so the glow fades
    // out instead of being clipped at the card edge.
    if (picking === 'swap' || picking === 'sole-survivor') {
      setStageOpen(true)
      return
    }
    const timer = window.setTimeout(() => setStageOpen(false), 560)
    return () => window.clearTimeout(timer)
  }, [picking])

  // Before the loader, not after it: the season-scoped reads stay disabled
  // until the league-season list answers, and a disabled query reads as
  // pending forever, so a refused read would sit under the loader for good.
  if (d.error) return <p className="text-terracotta-600">{d.error.message}</p>
  if (d.loading) return <PageLoader />
  // #520 gave Standings, Cast, and Rules the cold-start screen but not the
  // landing page, so the commissioner arriving at a league with no season met a
  // grey line instead of #526's "Create the first season" way in.
  if (!d.season) return <ColdStart />
  if (!d.userId) return <p className="text-gray-500">No active season.</p>

  const rosterPoints = new Map(d.breakdown.roster.map((r) => [r.contestant_id, r.points]))
  const pickResults = new Map(
    d.breakdown.picks.map((p) => [`${p.episode_id}:${p.contestant_id}`, p]),
  )
  const state = resolveMySeasonState(d.season, d.episodes)
  // Moments on the page wait out the recap. An unseen result counts before its
  // param lands (the router applies it a beat late, in a transition), and
  // until it has been continued.
  const recapPending = displayResult != null || recapId != null || d.automaticResult != null

  function openReplay(episode: Episode) {
    setReplayError(null)
    if (recapId === episode.id) return
    setRecapParam(episode.id)
  }

  async function acknowledgeResult() {
    if (!d.automaticResult || !d.season) return
    // Throws on failure, which is how the card knows to stay up and say so.
    await acknowledge.mutateAsync({
      leagueSeasonId: d.season.id,
      episodeId: d.automaticResult.episode_id,
    })
  }

  // Scored episodes in air order, so the recap pager can step to a neighbour by
  // flipping the recap param (which refetches like any replay).
  const rosterLockEp = d.season.roster_lock_episode
  const scoredOrder = d.episodes
    .filter((e) => e.status === 'scored' && rosterLockEp != null && e.episode_number >= rosterLockEp)
    .sort((a, b) => a.episode_number - b.episode_number)
    .map((e) => e.id)
  const recapIdx = recapId ? scoredOrder.indexOf(recapId) : -1
  const prevRecapId = recapIdx > 0 ? scoredOrder[recapIdx - 1] : null
  const nextRecapId = recapIdx >= 0 && recapIdx < scoredOrder.length - 1 ? scoredOrder[recapIdx + 1] : null

  // What the week says about itself. All derived — nothing is stored (#396
  // follow-up); the hero's "all set" and each lane's done/outstanding status
  // are a presentation summary of state the page already loads.
  function weekSummary(openEp: Episode) {
    const eliminatedIn = new Map(d.contestants.map((c) => [c.id, c.eliminated_in_episode]))
    const held = d.roster.filter((r) => r.active_until_episode === null)
    // "Active" means still playing, not still holding a slot — a dead slot is
    // exactly what the missing check is telling you to fix.
    const active = held.filter((r) => eliminatedIn.get(r.contestant_id) == null)
    const swappedThisEpisode = d.roster.some(
      (r) => r.active_until_episode === openEp.episode_number - 1,
    )

    const stillIn = d.contestants.filter(
      (c) => c.eliminated_in_episode == null || c.eliminated_in_episode >= openEp.episode_number,
    ).length
    // The finale ballot is the full bracket — Final 4 (4) + Final 3 (3) +
    // winner (1) = 8 picks — not weekly votes, so at the finale the ballot beat
    // tracks the live bracket instead (#86 follow-on). The count follows every
    // pick; "done" still waits on a locked-in ballot, like the weekly one.
    const isFinale = openEp.is_finale
    const finaleFilled = finaleProgress?.filled ?? 0
    // The Power Vote's name is a pick too (#673), but it is the advantage's
    // business, not the ballot's: the beat counts the regular names.
    const powerVote = d.plays.find(
      (p) =>
        p.episode_id === openEp.id &&
        p.advantage_type === 'double_vote_points' &&
        p.target_contestant_id != null,
    )?.target_contestant_id
    const maxPicks = isFinale
      ? 8
      : Math.max(0, Math.min(openEp.max_elimination_picks, stillIn - 1))
    // The play moves at once and the picks re-read a beat later, so clamp
    // rather than show "4 of 3" in between (#673).
    const saved = isFinale
      ? finaleFilled
      : Math.min(d.openPicks.filter((p) => p.contestant_id !== powerVote).length, maxPicks)

    // Holding a dead slot is a position, not a chore: sitting on an eliminated
    // castaway for a week — to spend the weekly play on a x2 instead, or to
    // see who looks strong first — is a legitimate way to play. So it is worth
    // saying out loud on the Tribe tab, but it is not a task: it never nags,
    // never takes the headline and never keeps the hero warm. Nothing can be
    // done about it at all once swaps are spent or closed, and by then most
    // rosters have one, so the note drops it then.
    //
    // Before the tribe locks it is a chore after all: rearranging is free
    // then, so a premiere boot left on the tribe is only ever missed.
    const deadSlots = held.length - active.length
    const heldDead = deadSlots > 0 && !swapsLocked(d.season!, d.episodes)
    const bootBeforeLock = deadSlots > 0 && openEp.episode_number <= (d.season!.roster_lock_episode ?? 0)
    const rosterDone = held.length > 0 && !bootBeforeLock
    // A finale ballot is only "done" when a full bracket has been locked in —
    // a complete-but-unsaved draft still owes a submit, same as the weekly one.
    const ballotDone = isFinale
      ? finaleFilled === maxPicks && Boolean(finaleProgress?.saved)
      : maxPicks > 0 && saved === maxPicks

    const beats: Beat[] = [
      {
        key: 'roster',
        // "Tribe" is the show's own word for your group, and it collides with
        // nothing on this page: the rows print tribe *names* (Kalokalo), never
        // the word. The BeatKey stays `roster` — the drop ids, the panel ids
        // and the scoring all speak roster.
        label: 'Tribe',
        done: rosterDone,
        note: `${active.length} active${heldDead ? ` · ${deadSlots} out` : ''}${swappedThisEpisode ? ' · swapped' : ''}`,
      },
      {
        key: 'ballot',
        label: 'Ballot',
        done: ballotDone,
        note: saved > 0 ? `${saved} of ${maxPicks}` : 'None',
      },
    ]

    // The advantage is optional, so it is never something you owe — but "all
    // set" is a lie while a ×2 you could still play is sitting there unspent,
    // so it gets its own headline rather than being counted or ignored.
    // Only two things are actually owed: a ballot, and a roster if you have
    // never set one.
    const noRoster = held.length === 0
    const left = (noRoster || bootBeforeLock ? 1 : 0) + (ballotDone ? 0 : 1)
    const advantageUnplayed =
      !d.plays.some((p) => p.episode_id === openEp.id) &&
      !openEp.is_finale &&
      advantagesOpenYet(d.season!, d.episodes) &&
      !advantagesLocked(openEp, d.season!)
    // The winner pick (#164): while the designation window is open and nobody
    // is named, "all set" is a lie — it's the biggest points swing of the
    // season, so the hero prompts for it, above the optional nags.
    const ssUnnamed =
      ssDesignationOpen(d.season!, d.episodes) && !d.roster.some((r) => r.is_sole_survivor)
    return {
      beats,
      // Nothing left at all, owed or optional. Colours the hero.
      settled: left === 0 && !advantageUnplayed && !ssUnnamed,
      // Name the thing rather than counting it: "1 task left" made you go
      // looking for which one.
      headline:
        left === 2
          ? 'Your ballot and tribe both need you'
          : !ballotDone
            ? saved === 0
              ? isFinale
                ? 'Your finale ballot is empty'
                : 'Your ballot is empty'
              : isFinale
                ? `${saved} of ${maxPicks} finale picks made`
                : `${saved} of ${maxPicks} votes cast`
            : noRoster
              ? 'Pick your tribe'
              : bootBeforeLock
                ? 'A castaway on your tribe is out'
                : ssUnnamed
                ? 'Name your Sole Survivor'
                : advantageUnplayed
                  ? 'Your advantage is still unplayed'
                  : isFinale
                    ? "You're all set for the finale"
                    : `You're all set for Ep ${openEp.episode_number}`,
    }
  }

  return (
    <>
      <div
        className="mx-auto max-w-2xl space-y-10"
        aria-hidden={displayResult ? true : undefined}
        inert={displayResult ? true : undefined}
      >
      {state.kind !== 'open' && state.kind !== 'watch_only' && (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl md:text-3xl tracking-wide text-forest-800">
              {d.season.name}
            </h1>
            {/* Complete owns its points in the result hero below, so the chip
                drops out of the masthead there (#686). */}
            {state.kind !== 'complete' && (
              <HeaderPoints standing={d.standing} rank={d.rank} count={d.playerCount} />
            )}
          </div>
          {/* The episode is named once, here: season, then episode, then the
              cards below carry only their own name (#732). */}
          {state.kind === 'locked' && (
            <EpisodeLabel
              episode={state.episode}
              suffix="locked"
              className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                isBroadcastWindow(state.episode) ? 'text-gold-300' : 'text-forest-700'
              }`}
              titleClassName={isBroadcastWindow(state.episode) ? 'text-white/60' : 'text-gray-500'}
            />
          )}
        </div>
      )}

      {/* The premiere wears the same record as a live week — hero, then the
          Tribe lane — so the page doesn't change shape once episode 2 opens.
          Only the Tribe beat exists yet: ballots and plays wait for episode 2. */}
      {state.kind === 'watch_only' && (
        <div className="space-y-3.5">
          <h1 className="font-display text-xl tracking-wide text-forest-800 md:text-2xl">
            {d.season.name}
          </h1>
          <ThisWeekHero
            eyebrow={
              <EpisodeLabel
                episode={{ episode_number: state.episode.episode_number, title: null }}
                suffix="watch only"
              />
            }
            headline="No action needed for the premiere"
            settled
            sub={<span>Your tribe locks at the start of episode {d.season.roster_lock_episode ?? 2}.</span>}
            right={<HeaderPoints standing={d.standing} rank={d.rank} count={d.playerCount} hero />}
          />
          <LaneStack lane="jade">
            <RecordBeats
              value="roster"
              onChange={() => {}}
              beats={[
                {
                  key: 'roster',
                  label: 'Tribe',
                  done: d.roster.length > 0,
                  note: d.roster.length > 0 ? 'Locked in' : 'Not chosen',
                },
              ]}
            />
            <RecordPanel beat="roster" active>
              <div id="roster">
                <RosterSection
                  revealOpen={recapPending}
                  season={d.season}
                  contestants={d.contestants}
                  episodes={d.episodes}
                  userId={d.userId}
                  rosterPoints={rosterPoints}
                  plays={d.plays}
                  setPlays={d.setPlays}
                />
              </div>
            </RecordPanel>
          </LaneStack>
        </div>
      )}

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

      {state.kind === 'open' && (() => {
        const week = weekSummary(state.episode)
        return (
        <div className="space-y-3.5">
          {/* The hero answers what you owe; the masthead still says whose
              season it is. The hero's own headline is a <p>, so this stays the
              page's one h1. */}
          <h1 className="font-display text-xl tracking-wide text-forest-800 md:text-2xl">
            {d.season.name}
          </h1>
          <ThisWeekHero
            /* The card is already "this week", so the eyebrow spends its line
               on the episode instead — named the one way the app names one
               (#530): the number pinned, the title absorbing the squeeze. */
            eyebrow={<EpisodeLabel episode={state.episode} titleClassName="text-gold-200" />}
            headline={week.headline}
            settled={week.settled}
            sub={<LockLine lockAt={state.episode.picks_lock_at} />}
            right={
              <HeaderPoints
                standing={d.standing}
                rank={d.rank}
                count={d.playerCount}
                hero
                roomLit={roomLit}
              />
            }
          >
            <AdvantageLane
              season={d.season}
              episodes={d.episodes}
              contestants={d.contestants}
              userId={d.userId}
              plays={d.plays}
              setPlays={d.setPlays}
            />
          </ThisWeekHero>

          {/* Rides the swap lock (one dial, no merge): SoleSurvivorLine
              self-gates on the designation window. */}
          <SoleSurvivorLine
            wait={displayResult != null || swapMomentPending}
            season={d.season}
            contestants={d.contestants}
            episodes={d.episodes}
            userId={d.userId}
            onStartSoleSurvivor={() => {
              setBeat('roster')
              setPicking('sole-survivor')
            }}
          />

          {/* Tabs and the lane they reveal share one border: a lane is one
              object again, the way the record's beats were (#396). */}
          <LaneStack
            lane={beat === 'roster' ? 'jade' : 'terracotta'}
            glowOut={stageOpen}
            lit={laneLit}
          >
          <RecordBeats
            value={beat}
            onChange={(next) => {
              // Every pick is answered on the Tribe, so leaving it ends the
              // pick: left on, the lamp chases the hidden panel to the top.
              if (next !== 'roster') setPicking(null)
              setBeat(next)
            }}
            beats={week.beats}
          />

          <RecordPanel
            beat="roster"
            active={beat === 'roster'}
            className={`stage-stage ${picking != null ? 'stage-lit' : ''}`}
          >
            <div id="roster">
              <RosterSection
                revealOpen={recapPending}
                onMomentPending={setSwapMomentPending}
                season={d.season}
                contestants={d.contestants}
                episodes={d.episodes}
                userId={d.userId}
                rosterPoints={rosterPoints}
                soleSurvivorBonus={d.breakdown.sole_survivor_bonus}
                plays={d.plays}
                setPlays={d.setPlays}
                picking={picking}
                onPickingDone={() => setPicking(null)}
                onStartSwap={() => setPicking('swap')}
                onStartDouble={() => setPicking('double')}
                swapSlot={swapSlot}
              />
            </div>
          </RecordPanel>

          <RecordPanel
            beat="ballot"
            active={beat === 'ballot'}
            className={`stage-stage ${ballotLit ? 'stage-lit' : ''}`}
          >
            <div id="votes">
              <PicksSection
                season={d.season}
                contestants={d.contestants}
                episodes={d.episodes}
                userId={d.userId}
                plays={d.plays}
                setPlays={d.setPlays}
                pickResults={pickResults}
                onOpenPicks={d.setOpenPicks}
                onFinaleProgress={setFinaleProgress}
                onWorkingChange={setBallotWorking}
              />
            </div>
          </RecordPanel>
          </LaneStack>

          {/* No slot under a recap: the first-loss moment keys off the slot, and
              it has to wait for the reveal to be dismissed (#717). */}
          {beat === 'roster' && !displayResult && (
            <div ref={setSwapSlot} className="flex min-h-8 justify-end px-1 empty:hidden" />
          )}

          {/* Promoted out of the record (#478 follow-on): one jade card under
              both lanes rather than an affordance that only existed on Roster.
              Spent plays fold into the same sheet (#545). */}
          <HistorySection
            season={d.season}
            userId={d.userId}
            episodes={d.episodes}
            plays={d.plays}
            contestants={d.contestants}
            pickResults={pickResults}
            onReplay={openReplay}
            replayLoading={replayLoading}
            replayError={replayError}
            recapOpen={displayResult != null}
            standing={d.standing}
          />
        </div>
        )
      })()}

      {state.kind === 'intermission' && <IntermissionState />}
      {state.kind === 'complete' && (
        <CompleteState
          season={d.season}
          contestants={d.contestants}
          episodes={d.episodes}
          userId={d.userId}
          rosterPoints={rosterPoints}
          plays={d.plays}
          soleSurvivorBonus={d.breakdown.sole_survivor_bonus}
          standing={d.standing}
          rank={d.rank}
          playerCount={d.playerCount}
        />
      )}

      {/* History is the archive: last thing on the page in every state that
          has no beat bar to carry it (#478). */}
      {state.kind !== 'open' && state.kind !== 'watch_only' && (
        <HistorySection
          season={d.season}
          userId={d.userId}
          episodes={d.episodes}
          plays={d.plays}
          contestants={d.contestants}
          pickResults={pickResults}
          onReplay={openReplay}
          replayLoading={replayLoading}
          replayError={replayError}
          recapOpen={displayResult != null}
          standing={d.standing}
        />
      )}

      </div>
      {displayResult && (
        <EpisodeResultReveal
          result={displayResult}
          mode={recapMode}
          soleSurvivorId={d.roster.find((pick) => pick.is_sole_survivor)?.contestant_id ?? null}
          onContinue={recapMode === 'automatic' ? acknowledgeResult : undefined}
          onClose={recapMode === 'replay' ? () => setRecapParam(null) : undefined}
          onPrev={recapMode === 'replay' && prevRecapId ? () => setRecapParam(prevRecapId) : undefined}
          onNext={recapMode === 'replay' && nextRecapId ? () => setRecapParam(nextRecapId) : undefined}
          field={
            <LeagueHub
              key={displayResult.episode_id}
              leagueSeasonId={d.season.id}
              episodeId={displayResult.episode_id}
              userId={d.userId}
              broadcast
              showCount={false}
            />
          }
        />
      )}
    </>
  )
}

/** The draft reads by tribe, the way the cast is introduced, biggest tribe
 *  first so a small side group (Exile, Redemption) lands at the bottom.
 *  Castaways without a tribe (the whole cast before the show assigns tribes)
 *  collect under a heading-less group at the end — a "No tribe" label just
 *  confuses a new player in the premiere week. */
function groupByTribe(
  cast: Contestant[],
): [{ name: string | null; color: string | null }, Contestant[]][] {
  const groups = new Map<string, { tribe: { name: string | null; color: string | null }; members: Contestant[] }>()
  for (const c of cast) {
    const key = c.tribe_name ?? '__none__'
    const g = groups.get(key) ?? { tribe: { name: c.tribe_name ?? null, color: c.tribe_color ?? null }, members: [] }
    g.members.push(c)
    groups.set(key, g)
  }
  return [...groups.values()]
    .sort((a, b) => {
      if (a.tribe.name == null) return 1
      if (b.tribe.name == null) return -1
      return b.members.length - a.members.length || a.tribe.name.localeCompare(b.tribe.name)
    })
    .map((g) => [g.tribe, g.members])
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

// The finished season stays a season, not a banner (#583 follow-on): your final
// tribe and finale ballot keep showing, read-only, the way they did all year —
// the roster cards (with tap-to-expand breakdowns) and the locked finale bracket
// the season left you with. Weekly ballots live in the History sheet below.
function CompleteState({
  season,
  contestants,
  episodes,
  userId,
  rosterPoints,
  plays,
  soleSurvivorBonus,
  standing,
  rank,
  playerCount,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
  rosterPoints: Map<string, number>
  plays: AdvantagePlay[]
  soleSurvivorBonus: number
  standing: StandingEntry | null
  rank: number | null
  playerCount: number
}) {
  // Mirror the live screen's lane tabs: Tribe, then the finale ballot.
  const [beat, setBeat] = useState<BeatKey>('roster')
  const finaleEp = episodes.find((e) => e.is_finale)
  // The finale bracket marks each pick against the real placements.
  const finaleActuals: FinaleActuals = {
    finalFour: new Set(contestants.filter((c) => c.placement != null && c.placement <= 4).map((c) => c.id)),
    finalThree: new Set(contestants.filter((c) => c.placement != null && c.placement <= 3).map((c) => c.id)),
    winner: contestants.find((c) => c.placement === 1)?.id ?? null,
  }
  const beats: Beat[] = [{ key: 'roster', label: 'Tribe', done: true, note: 'Your final tribe' }]
  if (finaleEp) beats.push({ key: 'ballot', label: 'Ballot', done: true, note: 'Your finale ballot' })

  return (
    <div className="space-y-3.5">
      {/* The result hero (#686): complete owns its points here, so the box is
          where you finished and the Tribe / Ballot / Finale split — on the This
          Week hero's green, the screen's last word. */}
      <section className="week-hero relative rounded-2xl px-5 pt-4 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-xs font-bold uppercase tracking-[0.18em] text-gold-300">
              Season complete
            </h2>
            <p className="mt-1 font-display text-2xl font-bold leading-tight text-cream-50">
              {standing && rank != null
                ? `You finished ${ordinal(rank)} of ${playerCount}`
                : 'Final standings are settled'}
            </p>
          </div>
          {standing && (
            <div className="shrink-0 text-right">
              <div className="font-display text-4xl font-bold leading-none tabular-nums text-gold-300">
                {standing.total_points}
              </div>
              <div className="mt-1 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-cream-100/60">
                points
              </div>
            </div>
          )}
        </div>
        {standing && (
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ['Tribe', standing.roster_points],
              ['Ballot', standing.elimination_points],
              ['Finale', standing.finale_points],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-cream-100/70">{label}</dt>
                <dd className="font-display text-xl tabular-nums text-gold-200">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* The same tribe and finale-ballot lanes the live screen shows, read-only
          now the season is over: RosterSection and FinaleBallot render their own
          locked views (#686). */}
      <LaneStack lane={beat === 'roster' ? 'jade' : 'terracotta'}>
        <RecordBeats value={beat} onChange={setBeat} beats={beats} />
        <RecordPanel beat="roster" active={beat === 'roster'}>
          <div id="roster">
            <RosterSection
              season={season}
              contestants={contestants}
              episodes={episodes}
              userId={userId}
              rosterPoints={rosterPoints}
              soleSurvivorBonus={soleSurvivorBonus}
              plays={plays}
              setPlays={() => {}}
            />
          </div>
        </RecordPanel>
        {finaleEp && (
          <RecordPanel beat="ballot" active={beat === 'ballot'}>
            <div id="finale">
              <FinaleBallot
                season={season}
                contestants={contestants}
                episodes={episodes}
                finaleEp={finaleEp}
                userId={userId}
                actuals={finaleActuals}
              />
            </div>
          </RecordPanel>
        )}
      </LaneStack>
    </div>
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
  // At the finale there is no weekly boot vote — the locked ballot is the
  // Final 4/3/winner bracket, so the prediction is read instead of the picks.
  // A refused prediction (404, no ballot submitted) reads as no ballot rather
  // than erroring the page, the way its `.catch` did.
  const rosterQ = useQuery(
    pathQuery<RosterPick[]>(`/league-seasons/${season.id}/roster/${userId}`),
  )
  const picksQ = useQuery(
    pathQuery<EliminationPick[]>(
      episode.is_finale
        ? null
        : `/league-seasons/${season.id}/episodes/${episode.id}/picks/${userId}`,
    ),
  )
  const finaleQ = useQuery(
    pathQuery<FinalePrediction>(
      episode.is_finale ? `/league-seasons/${season.id}/finale-predictions/${userId}` : null,
    ),
  )
  const finale = finaleQ.data ?? null
  const picks = episode.is_finale ? [] : (picksQ.data ?? null)
  const roster = rosterQ.data?.filter((pick) => pick.active_until_episode === null) ?? null

  // Error before loader: a disabled query stays pending, so a refused read
  // would otherwise sit under the loader for good.
  //
  // The bracket read is the forgiven one here, so it waits on an answer
  // rather than on "not pending": it 404s for everyone who filed no bracket,
  // and a refetch of a query with no data resets it to pending — so on
  // `isPending` the whole locked screen would drop to the loader for a round
  // trip every time the phone came back to it on finale night.
  const loadError = rosterQ.error ?? picksQ.error
  if (loadError) return <p className="text-terracotta-600">{loadError.message}</p>
  if (picks == null || roster == null || (episode.is_finale && !finaleQ.isFetched))
    return <PageLoader />

  const contestantMap = new Map(contestants.map((contestant) => [contestant.id, contestant]))
  const played = plays.find((play) => play.episode_id === episode.id)
  const broadcast = isBroadcastWindow(episode)

  // Only the roster members still in the game — a castaway voted out in an
  // earlier episode can't earn points, so listing them here is misleading.
  // Eliminations from the airing (not-yet-scored) episode aren't recorded yet,
  // so this keeps this-episode boots and finalists (never eliminated) in view.
  // The Sole Survivor leads, then whoever has earned you the most this season —
  // the same order the Field's tribes take.
  const activeRoster = roster
    .filter((pick) => {
      const elim = contestantMap.get(pick.contestant_id)?.eliminated_in_episode
      return elim == null || elim >= episode.episode_number
    })
    .sort(
      (a, b) =>
        Number(b.is_sole_survivor) - Number(a.is_sole_survivor) ||
        (rosterPoints.get(b.contestant_id) ?? 0) - (rosterPoints.get(a.contestant_id) ?? 0),
    )

  return (
    <>
    <section
      aria-labelledby="locked-state-title"
      data-variant={broadcast ? 'broadcast' : 'delayed'}
      className={`overflow-hidden rounded-2xl border border-t-2 border-t-gold-400 p-5 sm:p-6 ${
        broadcast
          ? 'border-white/15 bg-[radial-gradient(circle_at_top_right,rgba(196,84,50,0.18),transparent_35%),linear-gradient(to_bottom,#132e25,#0e1f19)] text-cream-100 shadow-xl ring-1 ring-black/40'
          : 'border-cream-200 bg-white text-gray-900 shadow-sm'
      }`}
    >
      {/* Your card is the only lit panel on the locked page: gold edge, shadow,
          the larger name. The league's cards below sit flat behind it (#732). */}
      <div className="flex items-center gap-2.5">
        <h2 id="locked-state-title" className="font-display text-3xl tracking-wide">
          {broadcast ? 'Tribal Council' : 'Results are pending'}
        </h2>
        {/* Beside the heading, not inside it: the card's accessible name stays
            the two words a screen reader should hear. */}
        <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-forest-900">
          You
        </span>
      </div>

      <div className="mt-8 grid gap-8">
        <div>
          <h3 className={`text-xs font-semibold uppercase tracking-wide ${broadcast ? 'text-white/60' : 'text-gray-500'}`}>
            Tribe
          </h3>
          {activeRoster.length > 0 ? <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {activeRoster.map((pick) => {
              const contestant = contestantMap.get(pick.contestant_id)
              const name = contestant ? displayName(contestant) : '—'
              return (
                <li
                  key={pick.id}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-sm ${
                    broadcast ? 'border-white/15 bg-black/10' : 'border-cream-200 bg-cream-50'
                  }`}
                >
                  {/* My Roster behaves the same locked as unlocked (#451): it
                      shows your scores in place, it does not send you to the Cast
                      page. */}
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="relative flex shrink-0">
                      <ContestantAvatar
                        name={name}
                        imageUrl={contestant?.image_url ?? null}
                        tribeColor={contestant?.tribe_color ?? null}
                        tribeName={contestant?.tribe_name ?? null}
                        size="sm"
                      />
                      {played?.advantage_type === 'double_roster_points' &&
                        played.target_contestant_id === pick.contestant_id && (
                          <AdvantageStamp size={15} title="Double Castaway Points this episode" />
                        )}
                    </span>
                    {/* The Sole Survivor pick is the torch after the name and
                        no more: it does not matter to this episode (#685). */}
                    <span className="truncate font-medium">{name}</span>
                    {pick.is_sole_survivor && (
                      <>
                        <SoleSurvivorTorch className="-ml-1 h-4 w-3 shrink-0" />
                        <span className="sr-only"> · Sole Survivor</span>
                      </>
                    )}
                  </span>
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
          </ul> : <p className={`mt-2 text-sm ${broadcast ? 'text-white/65' : 'text-gray-500'}`}>No active tribe was found.</p>}
        </div>

        <div className="tribal-border tribal-border--dim" aria-hidden="true" />
        {episode.is_finale ? (
          <div>
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${broadcast ? 'text-white/60' : 'text-gray-500'}`}>
              Finale ballot
            </h3>
            {finale &&
            (finale.final_four_contestant_ids.length > 0 ||
              finale.final_three_contestant_ids.length > 0 ||
              finale.winner_contestant_id) ? (
              <div className="mt-3 rounded-xl border-2 border-jade-500 bg-jade-50 p-5">
                <div className="flex flex-col items-center">
                  <VoteMark className="h-10 w-10" />
                  <p className={`mb-3 mt-1 font-semibold ${broadcast ? 'text-jade-100' : 'text-jade-800'}`}>Finale ballot locked</p>
                </div>
                <FinaleBracket
                  finalFour={finale.final_four_contestant_ids}
                  finalThree={finale.final_three_contestant_ids}
                  winner={finale.winner_contestant_id ?? ''}
                  byId={contestantMap}
                />
              </div>
            ) : (
              <p className={`mt-2 text-sm ${broadcast ? 'text-white/65' : 'text-gray-500'}`}>No finale ballot was submitted.</p>
            )}
          </div>
        ) : (
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${broadcast ? 'text-white/60' : 'text-gray-500'}`}>
              Ballot
            </h3>
            {played?.advantage_type === 'double_vote_points' && played.target_contestant_id == null && (
              <DoubleBadge size={24} title="Power Vote this episode" />
            )}
          </div>
          {picks.length > 0 ? (
            // The same handwritten slips you filed on the open ballot, so the
            // ballot reads as votes and the roster above as people (#685).
            <div className="mt-3 flex flex-wrap gap-3">
              {picks.map((pick, index) => {
                const contestant = contestantMap.get(pick.contestant_id)
                const name = contestant ? displayName(contestant) : '—'
                const doubled =
                  played?.advantage_type === 'double_vote_points' &&
                  played.target_contestant_id === pick.contestant_id
                return (
                  <VoteSlip
                    key={pick.id}
                    name={name}
                    doubled={doubled}
                    tribeColor={contestant?.tribe_color}
                    rotation={[-0.9, 0.6, -0.3][index % 3]}
                  />
                )
              })}
            </div>
          ) : (
            <p className={`mt-2 text-sm ${broadcast ? 'text-white/65' : 'text-gray-500'}`}>No ballot was submitted.</p>
          )}
        </div>
        )}

      </div>
    </section>

      {/* The league's locked table lives in its own card, one clear step
          removed from your personal roster/ballot above (#490). Everyone's
          choices open at once when the episode locks, so this is the
          watch-along Hub, not a leak. */}
      <LeagueHub
        leagueSeasonId={season.id}
        episodeId={episode.id}
        userId={userId}
        broadcast={broadcast}
        showCount={!episode.is_finale}
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
  leagueSeasonId,
  episodeId,
  userId,
  broadcast,
  showCount = true,
}: {
  leagueSeasonId: string
  episodeId: string
  userId: string
  broadcast: boolean
  /**
   * The Count tiles count weekly votes and advantage plays. A recap wants only
   * The Field, and the finale has neither a boot vote nor an advantage, so both
   * leave them off.
   */
  showCount?: boolean
}) {
  // Which player rows are open. Native <details> keeps its own state, so this
  // mirrors it through onToggle and lets one control open or close them all.
  const [openRows, setOpenRows] = useState<Set<string>>(new Set())

  const hubQ = useQuery(
    pathQuery<HubEntry[]>(`/league-seasons/${leagueSeasonId}/episodes/${episodeId}/hub`),
  )
  const entries = hubQ.data ?? null
  const failed = hubQ.isError

  // Flat and unshadowed on purpose: the personal card above is the lit one,
  // these are the league's paperwork. The episode is named at page level, so
  // each card carries only its own name (#732).
  const card = broadcast
    ? 'border-white/10 bg-white/[0.035] text-cream-100'
    : 'border-cream-200 bg-cream-50 text-gray-900'
  const panel = (id: string, title: string, children: React.ReactNode) => (
    <section
      aria-labelledby={id}
      className={`overflow-hidden rounded-2xl border p-5 sm:p-6 ${card}`}
    >
      <h2 id={id} className={`font-display text-xl tracking-wide ${broadcast ? 'text-cream-100/80' : 'text-gray-700'}`}>
        {title}
      </h2>
      {children}
    </section>
  )

  // Non-blocking: the Hub is a nice-to-have on top of your own locked card, so
  // a load failure or empty field just hides it rather than erroring the page.
  if (failed || (entries && entries.length === 0)) return null
  if (entries == null) {
    return (
      <div className="mt-10">
        {panel(
          'league-field-title',
          'The Field',
          <p className={`mt-3 text-sm ${broadcast ? 'text-white/65' : 'text-gray-500'}`}>Loading the field…</p>,
        )}
      </div>
    )
  }

  // Consensus boot: most-voted castaways across every ballot, and how many of
  // those votes were the ×2 (#685).
  const voteCount = new Map<string, { survivor: StandingSurvivor; n: number; doubled: number }>()
  for (const entry of entries) {
    const x2 = entry.advantage_type === 'double_vote_points' ? entry.advantage_target?.contestant_id : null
    for (const vote of entry.ballot) {
      const seen = voteCount.get(vote.contestant_id) ?? { survivor: vote, n: 0, doubled: 0 }
      seen.n += 1
      if (vote.contestant_id === x2) seen.doubled += 1
      voteCount.set(vote.contestant_id, seen)
    }
  }
  const topBoots = [...voteCount.values()].sort((a, b) => b.n - a.n).slice(0, 5)

  // Advantage aggregates. Doubles are the only playable advantage now (#307),
  // so we track just the two: how many doubled their ballot, and which
  // castaway drew the most Double Castaway Points.
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

  const allOpen = entries.every((e) => openRows.has(e.user_id))
  const sub = broadcast ? 'text-white/60' : 'text-gray-500'
  // Tiles sit a step lighter than the card so their edges read: white on the
  // cream card (delayed), a brighter frost on the faint panel (broadcast).
  const chip = broadcast ? 'border-white/15 bg-white/[0.07]' : 'border-cream-200 bg-white'

  // The two league cards sit close together as one pair, a clear step below
  // your own card above them.
  return (
    <div className="mt-10 space-y-3">
      {showCount && panel(
        'league-count-title',
        'The Count',
        // Where the league landed as a whole, one card before the per-player
        // list. Two tiles side by side once there's room, stacked on a phone.
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className={`rounded-xl border p-3 ${chip}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Consensus boot</p>
          {topBoots.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {topBoots.map(({ survivor, n, doubled }) => (
                <li key={survivor.contestant_id} className="flex items-center gap-2 text-sm">
                  <ContestantAvatar
                    name={survivor.name}
                    imageUrl={survivor.image_url}
                    tribeColor={survivor.tribe_color}
                    tribeName={survivor.tribe_name}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{survivor.name}</span>
                  {/* The seal carried no number when it sat on the portrait, so a
                      week of heavy Power Votes stamped every row alike. It counts
                      out loud here instead. */}
                  {doubled > 0 && (
                    <span
                      className={`flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums ${sub}`}
                    >
                      <DoubleBadge
                        size={14}
                        stamp
                        title={`${doubled} ${doubled === 1 ? 'Power Vote' : 'Power Votes'} on this castaway`}
                      />
                      {doubled}
                    </span>
                  )}
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
          <dl className="mt-2 space-y-1.5">
            {topRosterDoubles.map(({ survivor, n }) => (
              <div key={survivor.contestant_id} className="flex items-center gap-2">
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
            ))}
            {/* Power Vote has no target, so it sits last — below the castaway
                doubles, not above them where it read as their header. min-h-6
                keeps this avatar-less row the same height as the ones above. */}
            <div className="flex min-h-6 items-center gap-2">
              <dt className="min-w-0 flex-1 truncate text-sm">Power Vote</dt>
              <dd className={`shrink-0 text-sm font-semibold tabular-nums ${sub}`}>×{doubleBallots}</dd>
            </div>
          </dl>
        </div>
        </div>,
      )}

      {panel(
        'league-field-title',
        'The Field',
        <>
      {/* One collapsible row per player. */}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => setOpenRows(allOpen ? new Set() : new Set(entries.map((e) => e.user_id)))}
          className={`text-[11px] font-semibold uppercase tracking-wide underline underline-offset-2 ${broadcast ? 'text-gold-300' : 'text-forest-700'}`}
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <ul className="mt-2 space-y-2">
        {entries.map((entry) => {
          const isMe = entry.user_id === userId
          const powerVote =
            entry.advantage_type === 'double_vote_points'
              ? (entry.advantage_target?.contestant_id ?? null)
              : undefined
          const wholeBallotDoubled = powerVote === null
          // Points ride the row once the episode is scored (the recap Field);
          // pre-scoring the Hub is picks only, so these gate the recap extras.
          const scored = entry.tribe_points != null
          return (
            <li key={entry.user_id}>
              <details
                className={`group rounded-xl border ${chip}`}
                open={openRows.has(entry.user_id)}
                onToggle={(e) => {
                  const isOpen = (e.currentTarget as HTMLDetailsElement).open
                  setOpenRows((cur) => {
                    if (cur.has(entry.user_id) === isOpen) return cur
                    const next = new Set(cur)
                    if (isOpen) next.add(entry.user_id)
                    else next.delete(entry.user_id)
                    return next
                  })
                }}
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 p-3 text-sm">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-semibold">
                      {entry.display_name}
                      {isMe && <span className={`ml-1.5 font-normal ${sub}`}>(you)</span>}
                    </span>
                    {/* The play marker is left to the expanded detail, on the
                        exact castaway or ballot pick it changed. */}
                  </div>
                  {/* What their tribe and ballot earned this episode, so the
                      score reads at a glance without opening the row. */}
                  {scored && (
                    <span className="flex shrink-0 items-center gap-2.5 font-display tabular-nums">
                      <span className="flex items-baseline gap-1">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${sub}`}>Tribe</span>
                        <LanePoints value={entry.tribe_points ?? 0} broadcast={broadcast} />
                      </span>
                      <span className="flex items-baseline gap-1">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${sub}`}>Ballot</span>
                        <LanePoints value={entry.ballot_points ?? 0} broadcast={broadcast} />
                      </span>
                    </span>
                  )}
                  <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 transition-transform group-open:rotate-180 ${sub}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="grid gap-3 px-3 pb-3">
                  {/* The play lands where it applies: Power Vote on its named
                      pick (a #303-era play with no target doubled the whole
                      ballot), a roster double on its target castaway. */}
                  <HubCastawayRow
                    label="Tribe"
                    survivors={entry.roster}
                    sub={sub}
                    empty="No active tribe."
                    doubledContestantId={
                      entry.advantage_type === 'double_roster_points'
                        ? (entry.advantage_target?.contestant_id ?? null)
                        : null
                    }
                    soleSurvivorId={entry.sole_survivor_contestant_id}
                  />
                  {/* The finale's ballot is the bracket, drawn the way your own
                      card draws it (#801). */}
                  {entry.finale ? (
                    <div>
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Finale ballot</p>
                      <div className="mt-1.5">
                        <FinaleBracket
                          finalFour={entry.finale.final_four.map((s) => s.contestant_id)}
                          finalThree={entry.finale.final_three.map((s) => s.contestant_id)}
                          winner={entry.finale.winner?.contestant_id ?? ''}
                          byId={
                            new Map(
                              [...entry.finale.final_four, ...entry.finale.final_three, entry.finale.winner]
                                .filter((s) => s != null)
                                .map((s) => [s.contestant_id, s]),
                            )
                          }
                        />
                      </div>
                    </div>
                  ) : (
                  /* The Field follows Standings: the idol stamps the Power Vote,
                      and a fill says the vote was correct after scoring. */
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>Ballot</p>
                      {wholeBallotDoubled && (
                        <DoubleBadge size={16} title={`${ADV_LABELS.double_vote_points} on this whole ballot`} />
                      )}
                    </div>
                    {entry.ballot.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {entry.ballot.map((vote) => (
                          <HubBallotMark
                            key={vote.contestant_id}
                            name={vote.name}
                            power={vote.contestant_id === powerVote}
                            correct={vote.correct}
                            dark={broadcast}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className={`mt-1 text-xs ${sub}`}>No ballot submitted.</p>
                    )}
                  </div>
                  )}
                </div>
              </details>
            </li>
          )
        })}
      </ul>
        </>,
      )}
    </div>
  )
}

/** A signed lane total, coloured like the recap card's lane header. */
function LanePoints({ value, broadcast }: { value: number; broadcast: boolean }) {
  const tone =
    value > 0
      ? broadcast ? 'text-jade-200' : 'text-jade-700'
      : value < 0
        ? broadcast ? 'text-terracotta-200' : 'text-terracotta-600'
        : broadcast ? 'text-white/50' : 'text-gray-400'
  return (
    <span className={`shrink-0 font-display text-sm font-semibold tabular-nums ${tone}`}>
      {value > 0 ? '+' : ''}
      {value}
    </span>
  )
}

function HubCastawayRow({
  label,
  survivors,
  sub,
  empty,
  doubledContestantId = null,
  soleSurvivorId = null,
}: {
  label: string
  survivors: StandingSurvivor[]
  sub: string
  empty: string
  /** Single-target double: the idol on this castaway's portrait. */
  doubledContestantId?: string | null
  /** Their Sole Survivor pick: a small hand torch beside an otherwise plain name. */
  soleSurvivorId?: string | null
}) {
  return (
    <div>
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${sub}`}>{label}</p>
      {survivors.length > 0 ? (
        // Five to a row so a full tribe sits on one line; portrait over name,
        // the compact ×2 pinned to the portrait it doubled.
        <ul className="mt-1.5 grid grid-cols-5 gap-x-1 gap-y-2">
          {survivors.map((s) => {
            const isSS = s.contestant_id === soleSurvivorId
            return (
              <li key={s.contestant_id} className="flex min-w-0 flex-col items-center gap-1 text-center text-[11px]">
                <span className="relative">
                  <ContestantAvatar
                    name={s.name}
                    imageUrl={s.image_url}
                    tribeColor={s.tribe_color}
                    tribeName={s.tribe_name}
                    size="sm"
                  />
                  {s.contestant_id === doubledContestantId && (
                    <AdvantageStamp size={15} title="Double Castaway Points on them this episode" />
                  )}
                </span>
                <span className="flex w-full min-w-0 items-center justify-center gap-0.5 leading-tight">
                  <span className="truncate">{s.name}</span>
                  {/* Snuffed on the recap when this was the week they went out. */}
                  {isSS && <SoleSurvivorTorch snuffed={s.eliminated_episode != null} />}
                  {isSS && <span className="sr-only"> · Sole Survivor</span>}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className={`mt-1 text-xs ${sub}`}>{empty}</p>
      )}
    </div>
  )
}


/**
 * Everything you've already played, tucked out of the way (#307).
 */
function HistorySection({
  season,
  userId,
  episodes,
  plays,
  contestants,
  pickResults,
  onReplay,
  replayLoading,
  replayError,
  recapOpen,
  standing,
}: {
  season: Season
  userId: string
  episodes: Episode[]
  plays: AdvantagePlay[]
  contestants: Contestant[]
  pickResults: Map<string, PickResult>
  onReplay: (episode: Episode) => void
  replayLoading: string | null
  replayError: string | null
  recapOpen: boolean
  /** The card previews the last episode from the standings row the page
   *  already loaded (#803) — it used to build a whole episode result for two
   *  numbers, on every load, with the sheet shut. */
  standing: StandingEntry | null
}) {
  const [open, setOpen] = useState(false)
  // The sheet holds, its button saying Loading…, until the recap is up to
  // cover it: closing on the tap left the bare page showing while the replay
  // was read, and that looked like the tap had gone nowhere.
  useEffect(() => {
    if (recapOpen) setOpen(false)
  }, [recapOpen])

  // Weekly ballots only: the finale is its own 3-part ballot (#86), and
  // pre-roster-lock premieres accept no votes (#82).
  const weeklyEpisodes = episodes.filter(
    (ep) => !ep.is_finale && ep.episode_number >= (season.roster_lock_episode ?? 1),
  )
  const currentBallotEp =
    weeklyEpisodes.find((ep) => isEpisodeOpen(ep, season, episodes)) ??
    weeklyEpisodes.find((ep) => episodeClosed(ep) && ep.status !== 'scored')
  const closedBallots = weeklyEpisodes
    .filter((ep) => episodeClosed(ep) && ep.id !== currentBallotEp?.id)
    .reverse()

  // Past ballots, read the first time the sheet is opened rather than on every
  // page load — they are reference, and nobody reads them most weeks. One
  // keyed request for every closed episode's picks (#558), and the same path
  // the open ballot reads, so mid-season the sheet opens on an answer it
  // already has. A refusal draws no ballots rather than holding "Loading…".
  const closedBallotIds = closedBallots.map((ep) => ep.id).join(',')
  const pastQ = useQuery({
    ...pathQuery<Record<string, EliminationPick[]>>(
      `/league-seasons/${season.id}/picks/${userId}`,
    ),
    enabled: open && closedBallotIds !== '',
  })
  const pastBallots = pastQ.data
    ? new Map(Object.entries(pastQ.data))
    : pastQ.isError
      ? new Map<string, EliminationPick[]>()
      : null

  const scoredEpisodes = episodes
    .filter(
      (episode) =>
        episode.status === 'scored' &&
        season.roster_lock_episode != null &&
        episode.episode_number >= season.roster_lock_episode,
    )
    .sort((a, b) => b.episode_number - a.episode_number)

  if (scoredEpisodes.length === 0 && closedBallots.length === 0) return null

  // "+64, up 3 spots" — what the last episode did to you, so the card says
  // what's behind it rather than just naming itself.
  const preview = (() => {
    const parts = [`${scoredEpisodes.length} episode${scoredEpisodes.length === 1 ? '' : 's'}`]
    if (standing && scoredEpisodes.length > 0) {
      const spots = standing.trend_delta
      const move =
        standing.trend === 'up' || standing.trend === 'down'
          ? `${standing.trend} ${spots} spot${spots === 1 ? '' : 's'}`
          : null
      const pts = `${standing.last_episode_points > 0 ? '+' : ''}${standing.last_episode_points}`
      parts.push(`last: ${pts}${move ? `, ${move}` : ''}`)
    }
    return parts.join(' · ')
  })()

  return (
    <>
      {/* Promoted out of the record (#478 follow-on): a card of its own under
          both lanes. The recap replays and past ballots still
          open in a sheet, not an always-present page section. */}
      <button type="button" onClick={() => setOpen(true)} className="history-card">
        <span className="flex size-[34px] flex-none items-center justify-center rounded-lg bg-forest-600 text-gold-300">
          <HistoryIcon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[13px] font-bold uppercase tracking-[0.08em] text-jade-700">
            History
          </span>
          <span className="block truncate text-xs text-stone-500">{preview}</span>
        </span>
        <span className="flex-none text-jade-600" aria-hidden="true">
          <ChevronRightIcon className="size-[18px]" />
        </span>
      </button>

      {open &&
        createPortal(
          <HistorySheet
            scoredEpisodes={scoredEpisodes}
            closedBallots={closedBallots}
            pastBallots={pastBallots}
            pickResults={pickResults}
            plays={plays}
            contestants={contestants}
            onReplay={onReplay}
            replayLoading={replayLoading}
            replayError={replayError}
            onClose={() => setOpen(false)}
          />,
          // Into the shell, not document.body: the locked-night overrides are
          // scoped to .app-shell, so a body portal stays daylight under lock
          // (#478 follow-on). .app-shell has no transform, so fixed still pins
          // to the viewport.
          document.querySelector('.app-shell') ?? document.body,
        )}
    </>
  )
}

// The shared "moment": the page dims and a card comes up over it. One shell for
// the tribe-has-spoken free-swap nudge (#717), naming your Sole Survivor, and
// losing it (#164). Click the dim or the button to dismiss.
function Moment({
  titleId,
  title,
  children,
  onClose,
}: {
  titleId: string
  title: React.ReactNode
  children: React.ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="presentation">
      <div className="absolute inset-0 bg-forest-900/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-sm rounded-2xl bg-cream-50 p-6 text-center shadow-[0_8px_40px_rgba(10,22,19,0.35)] outline-none"
      >
        <h2
          id={titleId}
          className="font-display text-xl font-semibold uppercase tracking-wide text-forest-800"
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

// The tribe has spoken: the one-time nudge toward the free swap (#717).
function FirstLossMoment({ onClose }: { onClose: () => void }) {
  return (
    <Moment titleId="first-loss-title" title="The tribe has spoken" onClose={onClose}>
      <p className="mt-3 text-sm text-paper-ink">
        You've lost a castaway, but in this moment your tribe grows stronger. Use your{' '}
        <b className="text-gold-700">free swap</b> to replace your snuffed castaway with a new
        pick.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 rounded-full border border-gold-500 bg-gold-50 px-4 py-1.5 font-display text-sm font-semibold text-forest-700 shadow-sm hover:bg-gold-100"
      >
        Got it
      </button>
    </Moment>
  )
}

// The recap replays + past ballots, in a bottom sheet
// (#478) matching the app's other sheets. The recap closes the sheet; the recap
// reveal opens over the page from MySeasonPage.
function HistorySheet({
  scoredEpisodes,
  closedBallots,
  pastBallots,
  pickResults,
  plays,
  contestants,
  onReplay,
  replayLoading,
  replayError,
  onClose,
}: {
  scoredEpisodes: Episode[]
  closedBallots: Episode[]
  /** Null until the picks for those episodes land. */
  pastBallots: Map<string, EliminationPick[]> | null
  pickResults: Map<string, PickResult>
  plays: AdvantagePlay[]
  contestants: Contestant[]
  onReplay: (episode: Episode) => void
  replayLoading: string | null
  replayError: string | null
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Your own record (ballots) comes before the recaps, which are about the
  // episode rather than about you. Played advantages have no tab of their own:
  // the doubled castaway and the ×2 vote are read on the roster and the
  // ballot, where the points they doubled already are.
  const TABS = [
    { key: 'ballots' as const, label: 'Ballots', count: closedBallots.length },
    { key: 'recaps' as const, label: 'Recaps', count: scoredEpisodes.length },
  ]
  const [tab, setTab] = useState<'ballots' | 'recaps'>(
    () => (TABS.find((t) => t.count > 0) ?? TABS[0]).key,
  )

  useEffect(() => {
    panelRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function onKeyDown(e: React.KeyboardEvent) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.key === tab)
    const next = TABS[(i + delta + TABS.length) % TABS.length]
    setTab(next.key)
    document.getElementById(`history-tab-${next.key}`)?.focus()
  }

  return (
    // z-50: the tab bar sits at z-45 (#696) and was covering the sheet's last rows.
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:p-6" role="presentation">
      <div className="absolute inset-0 bg-forest-900/60" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        className="relative mx-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl sm:rounded-2xl bg-cream-50 shadow-[0_-8px_40px_rgba(10,22,19,0.35)] outline-none"
      >
        <div className="flex items-center justify-between gap-3 rounded-t-2xl bg-cream-100 px-4 py-3">
          <h2
            id="history-title"
            className="font-display text-sm font-semibold uppercase tracking-wide text-forest-800"
          >
            History
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-forest-700 underline underline-offset-2"
          >
            Close
          </button>
        </div>

        <div
          role="tablist"
          aria-label="History"
          onKeyDown={onKeyDown}
          className="flex items-stretch border-b border-cream-200 bg-cream-100 px-2"
        >
          {TABS.map((t) => {
            const active = t.key === tab
            return (
              <button
                key={t.key}
                id={`history-tab-${t.key}`}
                role="tab"
                type="button"
                aria-selected={active}
                aria-controls={`history-panel-${t.key}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.key)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 font-display text-sm font-semibold uppercase tracking-[0.06em] ${
                  active
                    ? 'border-forest-600 text-forest-800'
                    : 'border-transparent text-paper-ink-faded'
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className="rounded-full bg-forest-600 px-1.5 py-0.5 font-sans text-[9px] font-bold text-cream-50">
                    {t.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div
            id="history-panel-ballots"
            role="tabpanel"
            aria-labelledby="history-tab-ballots"
            hidden={tab !== 'ballots'}
            className="-mx-4"
          >
            {closedBallots.length === 0 ? (
              <p className="px-4 text-sm text-paper-ink-faded">No ballots have closed yet.</p>
            ) : pastBallots == null ? (
              <p className="px-4 text-sm text-paper-ink-faded">Loading…</p>
            ) : (
              closedBallots.map((ep) => (
                <BallotRecord
                  key={ep.id}
                  ep={ep}
                  picks={pastBallots.get(ep.id) ?? []}
                  pickResults={pickResults}
                  plays={plays}
                  contestants={contestants}
                />
              ))
            )}
          </div>

          <div
            id="history-panel-recaps"
            role="tabpanel"
            aria-labelledby="history-tab-recaps"
            hidden={tab !== 'recaps'}
          >
            {scoredEpisodes.length > 0 ? (
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
                          {episode.is_finale ? 'Finale' : `Ep ${episode.episode_number}`}
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
            ) : (
              <p className="text-sm text-paper-ink-faded">No episodes have been scored yet.</p>
            )}
            {replayError && <p role="alert" className="mt-2 text-sm text-terracotta-700">{replayError}</p>}
          </div>
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
  hero = false,
  roomLit = false,
}: {
  standing: StandingEntry | null
  rank: number | null
  count: number
  /** In the This Week hero the chip drops its brush swatch — the swatch is a
   *  dark stroke and the hero is already dark. Same breakdown behind the tap. */
  hero?: boolean
  /** The ballot room is dark. The open breakdown lifts the whole hero to z-40
   *  to clear the lane tabs, which would also pop it out from under the room's
   *  z-20 scrim and relight the hero mid-pick — so while the room is down the
   *  chip is just the number. */
  roomLit?: boolean
}) {
  const [wantOpen, setWantOpen] = useState(false)
  const open = wantOpen && !roomLit
  const total = standing?.total_points ?? 0
  const components = [
    { label: 'Tribe', value: standing?.roster_points ?? 0 },
    { label: 'Ballot', value: standing?.elimination_points ?? 0 },
    { label: 'Finale', value: standing?.finale_points ?? 0 },
  ]

  return (
    <div className="relative z-40 shrink-0">
      {hero ? (
        <HeroPoints
          total={total}
          rankLabel={rank != null ? ordinal(rank) : null}
          onClick={roomLit ? undefined : () => setWantOpen((v) => !v)}
          expanded={open}
        />
      ) : (
        <button
          type="button"
          onClick={() => setWantOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="header-points-breakdown"
          className="header-points inline-flex min-h-[4.75rem] min-w-[7.5rem] flex-col items-center justify-center px-5 py-3 text-center text-cream-100"
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider text-cream-100/75">
            My Points
          </div>
          <div className="font-display text-2xl font-bold leading-none tabular-nums text-gold-300">
            {total}
          </div>
          {rank != null && (
            <div className="mt-0.5 text-[11px] text-cream-100/75">
              {ordinal(rank)} of {count}
            </div>
          )}
        </button>
      )}
      {open && (
        <div
          id="header-points-breakdown"
          className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-cream-200 bg-white p-3 shadow-lg"
        >
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

/**
 * The team card's tally (My Season redesign): the lane's jade, at display
 * scale, with no unit: the column is unambiguous once the number is this size.
 */
function TeamPoints({ value }: { value: number | undefined }) {
  if (value == null) return null
  const color =
    value > 0 ? 'text-jade-600' : value < 0 ? 'text-terracotta-600' : 'text-stone-500'
  return (
    <span className={`font-display text-[19px] font-bold tabular-nums ${color}`}>
      {value > 0 ? '+' : ''}
      {value}
    </span>
  )
}

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

/**
 * The weekly advantage, as the hero's gold lane.
 *
 * It was a card of its own between the masthead and the beats (#399, slimmed
 * by #529). Inside the hero it says the same three things in a fraction of the
 * space: whether the play is spent, on what, and — while it isn't — where to
 * go and spend it. Playing and taking back both happen on the Tribe and
 * Ballot tabs.
 */
function AdvantageLane({
  season,
  episodes,
  contestants,
  userId,
  plays,
  setPlays,
}: {
  season: Season
  episodes: Episode[]
  contestants: Contestant[]
  userId: string
  plays: AdvantagePlay[]
  setPlays: React.Dispatch<React.SetStateAction<AdvantagePlay[]>>
}) {
  // The play is made on the Tribe or Ballot tab, where the thing it changes
  // is; players kept missing the idol as the tap target (#691). The lane
  // says where the play sits, or where to go and play it, and once played
  // it holds the one control left: Undo. The tabs' strips leave with the play.
  const weekly = useWeeklyPlay(season, episodes, plays, setPlays, userId)
  const episode = weekly.openEpisode
  // No advantage during the watch-only premiere, and none at the finale.
  if (!episode || episode.is_finale || !advantagesOpenYet(season, episodes)) return null
  const play = weekly.play
  const locked = weekly.locked

  const targetContestant = play?.target_contestant_id
    ? contestants.find((c) => c.id === play.target_contestant_id)
    : undefined
  const targetName = targetContestant ? displayName(targetContestant) : null

  // Say where and what it became, not just on whom: the same castaway can
  // be on your tribe and on your ballot (#673).
  const note = play
    ? play.advantage_type === 'double_roster_points'
      ? `Tribe · ${targetName ?? '—'} · double points`
      : play.advantage_type === 'double_vote_points'
        ? `Ballot · ${targetName ?? '—'} · Power Vote`
        : (ADV_LABELS[play.advantage_type] ?? 'Played')
    : locked
      ? 'Not played'
      : 'One per episode, played on your Tribe or Ballot'

  return (
    <HeroLane
      label="Advantage"
      done={play != null}
      muted={locked && play == null}
      note={
        weekly.error ? (
          <span role="alert" title={weekly.error} className="text-terracotta-200">
            {weekly.error}
          </span>
        ) : (
          note
        )
      }
      action={
        play != null && !locked ? (
          <button
            type="button"
            onClick={() => weekly.takeBack(play)}
            disabled={weekly.busy || play.id.startsWith('pending-')}
            className="shrink-0 font-display text-xs font-bold uppercase tracking-wide text-gold-200 underline underline-offset-2 disabled:opacity-40"
          >
            Undo
          </button>
        ) : !locked ? (
          // Unplayed: the rule is one tap away. Styled like Undo, since the
          // paper-page RuleLink is forest ink on this dark lane.
          <Link
            to="/rules#weekly-play"
            className="shrink-0 font-display text-xs font-bold uppercase tracking-wide text-gold-200 underline underline-offset-2"
          >
            How it works
          </Link>
        ) : undefined
      }
      icon={
        <span className={play == null && locked ? 'opacity-40 grayscale' : ''}>
          <DoubleBadge
            size={32}
            title={play ? 'Advantage played' : locked ? 'Advantage not played' : 'Your advantage'}
          />
        </span>
      }
    />
  )
}

function RosterSection({
  season,
  contestants,
  episodes,
  userId,
  rosterPoints,
  soleSurvivorBonus = 0,
  plays,
  setPlays,
  picking = null,
  onPickingDone,
  onStartSwap,
  onStartDouble,
  swapSlot,
  revealOpen = false,
  onMomentPending,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
  rosterPoints: Map<string, number>
  /** The episode results card is up: the moment waits for My Season. */
  revealOpen?: boolean
  /** True until the first-loss moment has shown or isn't coming (#798). */
  onMomentPending?: (pending: boolean) => void
  /** The +50% Sole Survivor finale bonus, named on the designated card. */
  soleSurvivorBonus?: number
  plays: AdvantagePlay[]
  setPlays: React.Dispatch<React.SetStateAction<AdvantagePlay[]>>
  /** Roster rows answer the Advantage section's "who do you double?" (#398)
   *  and, since swaps left that economy (#404), the roster's own
   *  "who do you drop?". */
  picking?: 'double' | 'swap' | 'sole-survivor' | null
  onPickingDone?: () => void
  onStartSwap?: () => void
  /** Start the Double Castaway Points pick: the rows answer it (#398). */
  onStartDouble?: () => void
  /** Where the Swap chip renders: a slot the parent keeps under the lane card. */
  swapSlot?: HTMLElement | null
}) {
  // The swapped-out ledger, folded into the card's footer.
  const [swappedOpen, setSwappedOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Who is holding the stage light, for the beat after being chosen.
  // Second half of a swap: who you tapped to drop, waiting on who replaces them.
  const [dropping, setDropping] = useState<string | null>(null)
  // Pre-lock, default to showing just your picks (so you can plan an advantage
  // on one); the full picker opens on Edit (#218).
  const [editing, setEditing] = useState(false)
  // Edit, Save and Cancel each take their own button out from under focus
  // (inert, disabled, unmounted), which dropped it on the body (#846). Hand it
  // across to whichever side is unfolding; untouched until Edit is first used.
  const pickerIntroRef = useRef<HTMLParagraphElement>(null)
  const editTribeRef = useRef<HTMLButtonElement>(null)
  const editUsed = useRef(false)
  useEffect(() => {
    if (!editUsed.current) return
    const target = editing ? pickerIntroRef.current : editTribeRef.current
    // The fold animates from where things are now; a scroll would fight it.
    target?.focus({ preventScroll: true })
  }, [editing])

  // Tap-to-expand per-episode breakdown (#257): lazy-fetch each contestant's
  // performance the first time its card is opened.
  const { expanded, perfs, toggleExpand } = useRosterBreakdown()

  // The same roster the page and the Sole Survivor line read, so it is one
  // request and one answer for all three (#816). The writes below name it, so
  // a swap or a designation refreshes it without a version counter.
  const rosterPath = `/league-seasons/${season.id}/roster/${userId}`
  const playsPath = `/league-seasons/${season.id}/advantage-plays/${userId}`
  const client = useQueryClient()
  const rosterQ = useQuery(pathQuery<RosterPick[]>(rosterPath))
  const roster = rosterQ.data ?? []
  // Distinct from "loaded but empty": until the read lands, an empty roster
  // must not render the "submission window has closed" fallback, which flashed
  // on every refresh mid-season before the roster arrived. A refusal counts as
  // answered, as it did when the failure set the error and left the list empty
  // — and `isFetched` holds that answer through a refetch, where `isPending`
  // would flicker this back to "not loaded" every time one ran.
  const rosterLoaded = rosterQ.isFetched

  // Seed the picker from the current active roster so pre-lock edits start
  // from what you already have (issue #84 free rearranging), and again after a
  // write changes it — the same refresh the version counter used to force.
  useEffect(() => {
    const active = (rosterQ.data ?? []).filter((p) => p.active_until_episode === null)
    if (active.length) setSelected(new Set(active.map((p) => p.contestant_id)))
  }, [rosterQ.data])

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
  // The swap-in badge expires once the episode after a castaway's debut airs:
  // it marks "this one's new" while you watch, then they're just roster. The
  // recap keeps it permanently (it's history). Anchored to the latest aired/
  // locked episode, not the open-episode pointer,
  // which goes blank during airing and would flicker the badge off mid-episode.
  const latestAired = episodes
    .filter(episodeClosed)
    .reduce((max, e) => Math.max(max, e.episode_number), 0)
  const swappedRoster = roster.filter((r) => r.active_until_episode !== null)
  // A swap's penalty is not booked until its episode locks (#164 follow-up) —
  // backend/app/scoring.py withholds it from the totals until then, because
  // the swap is undoable up to that point. As detached metadata beside the
  // name an unbooked penalty read as a heads-up; itemised inside the
  // breakdown it is an assertion that it sums to the total above it, so it
  // has to observe the same gate or it charges you for something you have not
  // been charged for.
  const penaltyBooked = (pick: RosterPick) =>
    episodes.some(
      (e) => e.episode_number === (pick.active_until_episode ?? 0) + 1 && episodeClosed(e),
    )
  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const merged = isMerged(contestants)

  // Light gold SS outline while the designation window is open, solid once
  // locked (#190).
  const ssOpen = ssDesignationOpen(season, episodes)

  // Double Castaway Points target the next open episode's roster scoring (#81),
  // and draw on the same single weekly play as the vote double and paid
  // swaps (#307).
  const weekly = useWeeklyPlay(season, episodes, plays, setPlays, userId)

  // A voted-out castaway lingers on the board — greyed — for the episode after
  // their boot, then sinks into the eliminated bin below with the swapped-out
  // picks (they're still held, active_until null; this is display only). Kept
  // one episode so "your castaway just went out" is visible before it's tucked
  // away. Picking who to swap out brings them back up: the bin's rows can't be
  // tapped, and a dead slot is the likeliest one to drop.
  const openEpNum = weekly.openEpisode?.episode_number
  const isStaleBoot = (pick: RosterPick) => {
    const elim = contestantMap.get(pick.contestant_id)?.eliminated_in_episode
    return picking !== 'swap' && elim != null && openEpNum != null && elim < openEpNum - 1
  }
  const boardRoster = activeRoster.filter((p) => !isStaleBoot(p))
  const retiredRoster = [...swappedRoster, ...activeRoster.filter(isStaleBoot)]

  const rosterDouble =
    weekly.play?.advantage_type === 'double_roster_points' ? weekly.play : undefined
  // The doubled row is held in the stage light and wears the idol stamp; the
  // tab doesn't repeat it.
  const doubledTarget = rosterDouble?.target_contestant_id ?? null

  const doubledByContestantEp = doubledByContestantEpisode(plays, episodes)
  const episodeTitles = new Map(episodes.map((e) => [e.episode_number, e.title]))

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
  // No cap on swaps in an episode: the rising price is the rate limit (#716). A
  // swap made this episode is reversible from its row until picks lock.
  const openEpNumber = weekly.openEpisode?.episode_number
  // Dropping someone swapped in this episode re-points that swap (roster.py):
  // it keeps its price rather than taking the next one.
  const reswapping =
    dropping != null &&
    openEpNumber != null &&
    activeRoster.some((p) => p.contestant_id === dropping && p.active_from_episode === openEpNumber)
  const swapAvailable =
    season.status !== 'completed' &&
    !windowOpen &&
    !swapsLocked(season, episodes) &&
    activeRoster.length > 0 &&
    swapCandidates.length > 0

  // The first time a castaway of yours is voted out (#717): the page dims,
  // says the tribe has spoken, and the Swap chip pulses. Only while the free
  // swap is still on the table and nothing has been swapped yet; remembered
  // per browser, so a new phone may say it once more.
  const [moment, setMoment] = useState<'popup' | 'nudge' | null>(null)
  const lostOne = activeRoster.some(
    (p) => contestantMap.get(p.contestant_id)?.eliminated_in_episode != null,
  )
  const firstLossOwed =
    rosterLoaded && lostOne && swappedRoster.length === 0 && swapAvailable && nextSwapCost === 0
  const firstLossDue =
    firstLossOwed &&
    picking == null &&
    swapSlot != null &&
    !revealOpen
  const firstLossKey = `mytribe.first-loss.${season.id}`
  useEffect(() => {
    if (!firstLossDue || moment != null) return
    try {
      if (localStorage.getItem(firstLossKey) === '1') return
      localStorage.setItem(firstLossKey, '1')
    } catch {
      return
    }
    setMoment('popup')
    // The chip is what the card points at, and on a phone it can be sitting
    // under the tab bar: bring it to mid-screen before the card comes up.
    document.querySelector('.swap-chip')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    // The moment fires once per browser; `moment` is only read to not re-fire mid-way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstLossDue, firstLossKey])

  // Pending while the card is up or still owed; "owed" ignores the slot and the
  // results card, so the Sole Survivor moment can't slip in ahead of it.
  let firstLossSeen = true
  try {
    firstLossSeen = localStorage.getItem(firstLossKey) === '1'
  } catch {
    // No storage: the moment never fires, so nothing to wait for.
  }
  const momentPending =
    !rosterLoaded || moment === 'popup' || (firstLossOwed && moment == null && !firstLossSeen)
  useEffect(() => {
    onMomentPending?.(momentPending)
  }, [momentPending, onMomentPending])

  // Every roster write names the roster and the plays: a save or a swap that
  // drops the doubled castaway deletes that play server-side (roster.py), and
  // the hero kept offering Undo on an advantage that no longer existed.
  //
  // What each write does when it lands — close the picker, leave the edit
  // sheet — is passed at the call below rather than set here, because a
  // mutate-level callback runs after the awaited refetch and one declared
  // here runs before it. Declared here, the lane would draw the old tribe for
  // a beat: the castaway you just dropped still on it, or the pre-edit tribe
  // under "Saved ✓".
  const undo = useApiMutation({
    write: (contestantId: string) =>
      api.quiet.delete(`/league-seasons/${season.id}/roster/swap/${contestantId}`),
    invalidates: [rosterPath, playsPath],
  })
  const swap = useApiMutation({
    write: (newContestantId: string) =>
      api.quiet.post<RosterPick>(`/league-seasons/${season.id}/roster/swap`, {
        old_contestant_id: dropping,
        new_contestant_id: newContestantId,
      }),
    invalidates: [rosterPath, playsPath],
  })
  // Name the Sole Survivor by tapping a roster card in the pick mode the
  // SoleSurvivorLine button starts — mirrors the swap (#164). The breakdown
  // carries the designation and its finale bonus, so it goes too.
  const designate = useApiMutation({
    write: (contestantId: string) =>
      api.quiet.post<RosterPick>(`/league-seasons/${season.id}/sole-survivor`, {
        contestant_id: contestantId,
      }),
    invalidates: [rosterPath, `/league-seasons/${season.id}/scoring-breakdown/${userId}`],
  })
  // Lands on the tap, the way the double does (#487): the badge moves and the
  // room comes back up at once, rather than a pause for the round-trip and then
  // two snaps (#826). The write's refetch reconciles either way, so a refused
  // designation puts the old one back without a rollback of its own.
  function designateSoleSurvivor(contestantId: string) {
    client.setQueryData<RosterPick[]>(['api', rosterPath], (prev) =>
      prev?.map((p) =>
        p.active_until_episode === null
          ? { ...p, is_sole_survivor: p.contestant_id === contestantId }
          : p,
      ),
    )
    onPickingDone?.()
    designate.mutate(contestantId)
  }
  const submit = useApiMutation({
    write: (contestantIds: string[]) =>
      api.quiet.post<RosterPick[]>(`/league-seasons/${season.id}/roster`, {
        contestant_ids: contestantIds,
      }),
    invalidates: [rosterPath, playsPath],
  })

  const swapping = undo.isPending || swap.isPending
  const submitting = submit.isPending
  const designatingSS = designate.isPending
  const error =
    rosterQ.error?.message ??
    undo.error?.message ??
    swap.error?.message ??
    designate.error?.message ??
    submit.error?.message ??
    null

  // Pre-lock, Edit lives in the lane's footer (the Snuffed ledger's slot
  // mid-season) rather than the toolbar, where it stacked a quiet text link
  // over the advantage strip's louder "Play it here" in week two.
  // The picker shows for a first pick, or pre-lock once Edit is tapped.
  const pickerOpen = windowOpen && (!hasRoster || editing)

  // The advantage on this tab (#673 follow-on): one play per episode, on
  // your tribe or your ballot. On offer, or designating (drag the idol onto
  // a row, or tap one). Once played anywhere the strip leaves both tabs:
  // the seal on the row or the gold card is the record, and the hero holds
  // Undo, which brings the offer back.
  const canDouble = activeRoster.some(
    (p) => contestantMap.get(p.contestant_id)?.eliminated_in_episode == null,
  )
  const stripLink =
    'shrink-0 font-display text-[11px] font-bold uppercase tracking-wide text-forest-700 underline underline-offset-2 disabled:opacity-40'
  const advantageStrip =
    weekly.openEpisode == null ||
    weekly.openEpisode.is_finale ||
    weekly.locked ||
    weekly.play != null ||
    !canDouble ? null : (
      // The same gold card the Ballot tab uses, on its own padded band, so
      // it reads as an object rather than a band bleeding out of the toolbar.
      <div className="border-b border-paper-line px-4 py-3">
      {/* Both states share one grid cell so the box keeps the taller (default)
          height when it flips to the shorter "Tap a Survivor" prompt — no jump
          on "Play it here" (#164). The idle state is invisible, not removed, so
          it still reserves that height and stays out of the a11y tree. */}
      <div
        role="region"
        aria-label="Advantage"
        className="grid grid-cols-1 rounded-lg border border-gold-500/60 bg-gold-50 px-3 py-2.5 text-xs text-forest-800"
      >
        <div
          className={`col-start-1 row-start-1 flex items-center gap-3 ${picking === 'double' ? 'invisible' : ''}`}
        >
          <span className="min-w-0 flex-1">
            Play your <b className="text-gold-700">advantage</b>{' '}
            <span aria-hidden="true" className="inline-flex align-[-3px]">
              <DoubleBadge size={16} />
            </span>{' '}
            on your tribe to receive a <b>double point boost</b> for one Survivor.
          </span>
          <button
            type="button"
            onClick={() => onStartDouble?.()}
            disabled={weekly.busy}
            className="shrink-0 rounded-full border border-gold-500 bg-white px-2.5 py-1 font-display text-sm font-semibold text-forest-700 shadow-sm transition-colors hover:bg-gold-100 disabled:opacity-40"
          >
            Play it here
          </button>
        </div>
        <div
          className={`col-start-1 row-start-1 flex items-center gap-3 ${picking === 'double' ? '' : 'invisible'}`}
        >
          <span className="min-w-0 flex-1">
            <b>Tap a Survivor</b> to earn double points this episode.
          </span>
          <button type="button" onClick={() => onPickingDone?.()} className={stripLink}>
            Cancel
          </button>
        </div>
      </div>
      </div>
    )

  // The swap sits under the lane card, not in it: beside the ×2 card it read
  // as a second advantage (its gold diamond as a tribe colour), and as a
  // footer row it collided with Snuffed. The parent owns
  // the slot so the chip can leave the card; while picking, Cancel rides on
  // the instruction banner instead.
  const swapFoot = swapAvailable ? (
      <button
        type="button"
        disabled={picking != null}
        onClick={() => {
          setMoment(null)
          // Cleared on the way in, not out: the strip and the replacements
          // keep their words while they fold away (#826).
          setDropping(null)
          onStartSwap?.()
        }}
        aria-label={`Swap · ${nextSwapCost === 0 ? 'free' : nextSwapCost}`}
        data-pulse={moment != null || undefined}
        // While picking the chip greys out and can't be tapped, but keeps its
        // row so History doesn't jump up when the offer steps aside (#164).
        // Never lifted above the card's scrim: the pulsing halo painted over
        // the card's corner, and the animation's compositing layer drew its
        // own hairline box on top of it. The chip waits under the dim and the
        // halo is there when the card closes.
        className="swap-chip inline-flex min-h-8 items-center gap-1.5 rounded-full border border-gold-500 bg-gold-50 px-2.5 py-1 font-display text-sm font-semibold text-forest-700 shadow-sm transition-colors hover:bg-gold-100 disabled:opacity-40 disabled:shadow-none"
      >
        <span>Swap</span>
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
    ) : null

  return (
    <>
      {/* A swap, or the Edit picker that replaces the rows the idol would land
          on (#706), folds the offer out of the way rather than pulling it (#826). */}
      <div
        className="collapse-rows"
        data-open={picking !== 'swap' && !pickerOpen}
        inert={picking === 'swap' || pickerOpen}
        aria-hidden={picking === 'swap' || pickerOpen}
      >
        <div>{advantageStrip}</div>
      </div>
      <div
        className="collapse-rows"
        data-open={picking === 'swap'}
        inert={picking !== 'swap'}
        aria-hidden={picking !== 'swap'}
      >
        <div>
        <p className="flex items-center gap-3 border-b border-terracotta-200 bg-terracotta-50/80 px-4 py-2 text-xs font-semibold text-terracotta-800">
          <span className="min-w-0 flex-1">
            {dropping
              ? `Choose who replaces ${(() => {
                  const droppingC = contestantMap.get(dropping)
                  return droppingC ? displayName(droppingC) : 'them'
                })()}`
              : 'Choose a castaway to drop'}
            <span className="ml-3 font-normal"><RuleLink anchor="swaps">How swaps work</RuleLink></span>
          </span>
          <button
            type="button"
            onClick={() => onPickingDone?.()}
            className="shrink-0 text-[11px] uppercase tracking-wide text-forest-700 underline underline-offset-2"
          >
            Cancel
          </button>
        </p>
        </div>
      </div>
      {/* Always mounted so it can fold away with the room light instead of
          vanishing in one frame (#826); inert while folded. */}
      <div
        className="collapse-rows"
        data-open={picking === 'sole-survivor'}
        inert={picking !== 'sole-survivor'}
        aria-hidden={picking !== 'sole-survivor'}
      >
        <div>
        <p className="flex items-center gap-3 border-b border-gold-300 bg-gold-50 px-4 py-2 text-xs font-semibold text-gold-800">
          <span className="min-w-0 flex-1">
            <b>Tap the castaway</b> you're backing to win it all.
            <span className="ml-3 font-normal"><RuleLink anchor="sole-survivor">How it works</RuleLink></span>
          </span>
          <button
            type="button"
            onClick={() => onPickingDone?.()}
            className="shrink-0 text-[11px] uppercase tracking-wide text-forest-700 underline underline-offset-2"
          >
            Cancel
          </button>
        </p>
        </div>
      </div>
      {(error || weekly.error) && (
        <p role="alert" className="px-4 py-2 text-sm text-terracotta-600">
          {error ?? weekly.error}
        </p>
      )}

      {/* The tribe and the picker trade places by folding, the way the ballot
          and swap pickers do (#826): Edit folds the tribe up into the picker,
          and Save or Cancel folds it back. Both stay mounted while the window
          is open so there is something to fold. */}
      {rosterLoaded && (
        <div
          className="collapse-rows"
          data-open={hasRoster && !pickerOpen}
          inert={!hasRoster || pickerOpen}
          aria-hidden={!hasRoster || pickerOpen}
        >
        <div>
          <ul>
            {/* Boots sink to the bottom (#190); stable sort keeps the rest in place.
                Each card's points are what that castaway earned *you*: the
                breakdown folds in Double Castaway Points and the Sole Survivor
                finale bonus, so it can differ from their raw cast-page total. */}
            {[...boardRoster]
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
                showTribe={!merged}
                isSoleSurvivor={pick.is_sole_survivor}
                soleSurvivorBonus={pick.is_sole_survivor ? soleSurvivorBonus : 0}
                isDoubled={doubledTarget === pick.contestant_id}
                ssWindowOpen={ssOpen}
                swappedInEpisode={
                  pick.active_from_episode > rosterBaseEp && latestAired <= pick.active_from_episode
                    ? pick.active_from_episode
                    : null
                }
                onUndoSwap={
                  // Reversible until picks lock — see the swap-undo decision.
                  picking == null &&
                  !swapping &&
                  pick.active_from_episode > rosterBaseEp &&
                  pick.active_from_episode === openEpNumber
                    ? () => undo.mutate(pick.contestant_id)
                    : undefined
                }
                right={<TeamPoints value={rosterPoints.get(pick.contestant_id) ?? 0} />}
                bioLink={false}
                prominent
                onSelect={
                  picking === 'swap' && !swapping
                    ? () => setDropping(pick.contestant_id)
                    : picking === 'double' && !weekly.busy
                      ? () => {
                          // Leave picking mode now — the seal lands
                          // optimistically, so waiting for the round-trip
                          // held the stage a beat past the pick (#487).
                          onPickingDone?.()
                          weekly.replace('double_roster_points', pick.contestant_id)
                        }
                      : // Only a still-active, still-in castaway can be the
                        // Sole Survivor (#164); the backend rejects the rest.
                        picking === 'sole-survivor' &&
                          !designatingSS &&
                          pick.active_until_episode === null &&
                          contestantMap.get(pick.contestant_id)?.eliminated_in_episode == null
                        ? () => designateSoleSurvivor(pick.contestant_id)
                        : undefined
                }
                selected={
                  picking === 'swap'
                    ? dropping === pick.contestant_id
                    : picking === 'sole-survivor'
                      ? pick.is_sole_survivor
                      : doubledTarget === pick.contestant_id
                }
                expanded={expanded.has(pick.contestant_id)}
                onToggle={() => toggleExpand(pick.contestant_id)}
              >
                <RosterBreakdown
                  perf={perfs.get(pick.contestant_id)}
                  activeFrom={pick.active_from_episode}
                  activeUntil={pick.active_until_episode}
                  doubledByEp={doubledByContestantEp.get(pick.contestant_id) ?? EMPTY_EP_MAP}
                  episodeTitles={episodeTitles}
                />
              </RosterCard>
            ))}
          </ul>

          <div
            className="collapse-rows"
            data-open={picking === 'swap' && dropping != null}
            inert={!(picking === 'swap' && dropping != null)}
            aria-hidden={!(picking === 'swap' && dropping != null)}
          >
            <div>
            <div className="space-y-2 border-t border-paper-line px-4 py-3">
              {/* The price is the mechanic now, so it reads at full strength
                  rather than as faded helper text. */}
              <p className="text-xs text-paper-ink">
                Takes effect this episode and{' '}
                {reswapping ? (
                  <span className="font-semibold">
                    replaces the swap you already made, at no extra cost
                  </span>
                ) : nextSwapCost === 0 ? (
                  <span className="font-semibold">is free — your first swap of the season</span>
                ) : (
                  <>
                    <span className="font-semibold">costs {nextSwapCost} points</span>, charged to
                    the castaway you drop
                  </>
                )}
                , and you can undo it until picks lock.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {swapCandidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() =>
                      swap.mutate(c.id, { onSuccess: () => onPickingDone?.() })
                    }
                    disabled={swapping}
                    className="flex items-center gap-2 p-3 rounded-lg border border-cream-200 bg-white text-left text-sm font-medium text-gray-700 hover:border-forest-500 disabled:opacity-40"
                  >
                    <ContestantAvatar
                      name={displayName(c)}
                      imageUrl={c.image_url}
                      size="sm"
                      tribeColor={c.tribe_color}
                      tribeName={c.tribe_name}
                    />
                    <span>{displayName(c)}</span>
                  </button>
                ))}
              </div>
            </div>
            </div>
          </div>

        </div>
        </div>
      )}
      {rosterLoaded && windowOpen && (
        <div
          className="collapse-rows"
          data-open={pickerOpen}
          inert={!pickerOpen}
          aria-hidden={!pickerOpen}
        >
        <div>
        <div className="p-4">
          <p ref={pickerIntroRef} tabIndex={-1} className="text-sm text-gray-600 mb-1 outline-none">
            {hasRoster
              ? `Rearrange your tribe freely before episode ${season.roster_lock_episode}.`
              : `Choose ${season.roster_size} castaways for your tribe.`}
          </p>
          <p className="text-xs text-gray-500 mb-4">
            {selected.size} / {season.roster_size} selected
          </p>
          {groupByTribe(contestants).map(([tribe, members]) => (
          <div key={tribe.name ?? '__none__'} className="mb-4">
            {tribe.name && (
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-forest-700">
              {tribe.color && (
                <span className="tribe-marker" style={{ backgroundColor: tribe.color }} aria-hidden="true" />
              )}
              {tribe.name}
            </h3>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {members.map((c) => {
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
                  <ContestantAvatar name={displayName(c)} imageUrl={c.image_url} size="sm" tribeColor={c.tribe_color} tribeName={c.tribe_name} />
                  <span className={isOut ? ELIMINATED_STRIKE : ''}>{displayName(c)}</span>
                  {isOut && (
                    <span className="ml-auto text-[11px] uppercase tracking-wide text-terracotta-500">
                      out
                    </span>
                  )}
                </button>
              )
            })}
            </div>
          </div>
          ))}
          <div className="flex items-center gap-3">
            <button
              onClick={() => submit.mutate([...selected], { onSuccess: () => setEditing(false) })}
              disabled={selected.size !== season.roster_size || !rosterDirty || submitting}
              className="px-4 py-2 bg-jade-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-jade-700 transition-colors"
            >
              {submitting ? 'Saving…' : hasRoster ? 'Save changes' : 'Lock In Tribe'}
            </button>
            {hasRoster && (
              // The draft keeps its picks, and this button, while it folds
              // away; Edit reseeds it on the way back in.
              <button
                onClick={() => setEditing(false)}
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
        </div>
        </div>
      )}
      {rosterLoaded && !hasRoster && !windowOpen && (
        <p className="p-4 text-sm text-gray-500">
          {season.roster_lock_episode == null
            ? 'Tribe selection has not opened yet.'
            : 'Tribe selection has closed.'}
        </p>
      )}
      {windowOpen && rosterLoaded && hasRoster && (
        <div className="collapse-rows" data-open={!editing} inert={editing} aria-hidden={editing}>
        <div>
        <button
          ref={editTribeRef}
          type="button"
          onClick={() => {
            editUsed.current = true
            setSelected(new Set(savedContestantIds))
            setEditing(true)
          }}
          className="lane-card__foot justify-center text-sm text-stone-500"
        >
          Your tribe locks when episode {season.roster_lock_episode} starts.
          <span className="font-semibold text-jade-700 underline underline-offset-2">Edit tribe</span>
        </button>
        </div>
        </div>
      )}
      {swapSlot && swapFoot && createPortal(swapFoot, swapSlot)}
      {moment === 'popup' &&
        // On the body: the lane panel is its own stacking context (z-30), under
        // the tab bar.
        createPortal(
          <FirstLossMoment
            onClose={() => setMoment('nudge')}
          />,
          document.body,
        )}
      {retiredRoster.length > 0 && (
        <button
          type="button"
          onClick={() => setSwappedOpen((o) => !o)}
          aria-expanded={swappedOpen}
          className="lane-card__foot justify-center gap-1.5 text-sm font-semibold text-jade-700"
        >
          Snuffed
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 transition-transform ${swappedOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      {swappedOpen && (
        <ul className="border-t border-paper-line bg-black/[.03]">
              {retiredRoster.map((pick) => (
                // Two kinds land here: castaways you swapped away (still earned
                // you points while held; may even still be in — RosterCard only
                // strikes an actual boot), and castaways voted out that have
                // aged off the board. Either way the row opens onto the same
                // per-episode breakdown, scoped to the episodes they were yours.
                <RosterCard
                  key={pick.id}
                  contestantId={pick.contestant_id}
                  contestant={contestantMap.get(pick.contestant_id)}
                  showTribe={!merged}
                  // A snuffed Sole Survivor keeps its snuffed torch for the rest of the season.
                  isSoleSurvivor={pick.is_sole_survivor}
                  right={
                    <span className="flex items-center gap-2 text-xs">
                      <Points value={rosterPoints.get(pick.contestant_id)} />
                      {/* The penalty is itemised inside the breakdown, not
                          hung off the name (#556 follow-on) — the total on the
                          left already includes it. Only a swap has an ep range;
                          a voted-out pick you still hold shows "Out · ep N" in
                          the row's own note instead. */}
                      {pick.active_until_episode !== null && (
                        <span className="text-paper-ink-faded">
                          ep {pick.active_from_episode}–{pick.active_until_episode}
                        </span>
                      )}
                    </span>
                  }
                  bioLink={false}
                  expanded={expanded.has(pick.contestant_id)}
                  onToggle={() => toggleExpand(pick.contestant_id)}
                >
                  <RosterBreakdown
                    perf={perfs.get(pick.contestant_id)}
                    activeFrom={pick.active_from_episode}
                    activeUntil={pick.active_until_episode}
                    doubledByEp={doubledByContestantEp.get(pick.contestant_id) ?? EMPTY_EP_MAP}
                    episodeTitles={episodeTitles}
                    swapPenalty={
                      pick.active_until_episode !== null && penaltyBooked(pick)
                        ? pick.swap_penalty_points
                        : 0
                    }
                  />
                </RosterCard>
              ))}
        </ul>
      )}
    </>
  )
}

// ─── Picks section ──────────────────────────────────────────────────────────

/**
 * One episode's ballot as a record line: the votes, which ones came true, and
 * what the ×2 paid. Drawn prominently for the episode you're waiting on, and
 * flat for a past one inside the History sheet.
 */
function BallotRecord({
  ep,
  picks,
  pickResults,
  plays,
  contestants,
  current = false,
}: {
  ep: Episode
  picks: EliminationPick[]
  pickResults: Map<string, PickResult>
  plays: AdvantagePlay[]
  contestants: Contestant[]
  current?: boolean
}) {
  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const scored = ep.status === 'scored'
  // The ballot play wears the idol once (#484). Power Vote names one pick
  // (#673), and the idol sits on that vote. A #303-era play has no target and
  // doubled the whole ballot, so its idol stands apart: a corner-seal stamp on
  // the prominent current ballot, a small seal by the episode number on the
  // compact past rows.
  const ballotDouble = plays.find(
    (pl) => pl.episode_id === ep.id && pl.advantage_type === 'double_vote_points',
  )
  const ballotDoubled = ballotDouble != null
  const x2 = ballotDouble?.target_contestant_id ?? null
  // The ballot you are waiting on is the same sheet you filled in — the paper
  // does not change at lock, only what you can do with it.
  if (current)
    return (
      <div className="ballot-sheet">
        {ballotDoubled && !x2 && <BallotStamp size={48} />}
        {picks.length > 0 ? (
          <div className="ballot-sheet__slips mb-4">
            {picks.map((p, index) => {
              const result = pickResults.get(`${ep.id}:${p.contestant_id}`)
              const pickC = contestantMap.get(p.contestant_id)
              const name = pickC ? displayName(pickC) : '—'
              // Only scored episodes have a settled result. A correct vote gets
              // the CorrectVote pill; incorrect stays neutral, not red — most
              // votes miss and a wall of red feels bad (#53, #135).
              const power = p.contestant_id === x2
              if (scored && result?.correct === true)
                return (
                  <CorrectVote
                    key={p.id}
                    name={name}
                    points={result.points > 0 ? result.points + (power ? (ballotDouble?.points_earned ?? 0) : 0) : undefined}
                    power={power}
                  />
                )
              return (
                <VoteSlip
                  key={p.id}
                  name={name}
                  stale={
                    pickC?.eliminated_in_episode != null &&
                    pickC.eliminated_in_episode < ep.episode_number
                  }
                  doubled={power}
                  tribeColor={pickC?.tribe_color}
                  rotation={[-0.9, 0.6, -0.3][index % 3]}
                />
              )
            })}
          </div>
        ) : (
          <p className="mb-4 text-sm text-gray-500">No votes submitted</p>
        )}
        {/* Never show the raw DB status — a locked, unscored episode said
            "upcoming", the opposite of true (#272). */}
        <p
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${
            scored ? 'bg-jade-50 text-jade-700' : 'bg-gold-50 text-gold-700'
          }`}
        >
          {scored ? 'Scored' : 'Awaiting scoring'}
        </p>
      </div>
    )

  // A past ballot is a ledger line, not a card: episode, who you wrote down,
  // and whether it has been scored, all on one row. The episode title is the
  // first thing cut — the recap carries it, and this row only has to say
  // which week it was.
  return (
    <div className="flex items-center gap-2 border-b border-paper-line px-4 py-2 last:border-b-0">
      <span className="shrink-0 text-sm font-medium text-gray-700">
        {ep.is_finale ? 'Finale' : `Ep ${ep.episode_number}`}
      </span>
      {ballotDoubled && !x2 && <DoubleBadge size={18} title="Power Vote this episode" />}
      {/* Overflows with two or three chips on a narrow phone, so it is a
          scroll container and has to be focusable — otherwise the votes past
          the fold are unreachable by keyboard or switch (WCAG 2.1.1). */}
      <span
        role="group"
        aria-label="Votes"
        tabIndex={0}
        // Room above the chips for the stamp, which the scroller would clip.
        className={`flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto ${x2 ? 'pt-1.5 pr-1.5' : ''}`}
      >
        {picks.length === 0 ? (
          <span className="text-sm text-gray-500">No votes</span>
        ) : (
          picks.map((p) => {
            const result = pickResults.get(`${ep.id}:${p.contestant_id}`)
            const pickC = contestantMap.get(p.contestant_id)
            const name = pickC ? displayName(pickC) : '—'
            // Same rule as the prominent ballot: correct votes get the pill,
            // misses stay neutral rather than red (#53, #135). The idol sits
            // on the named pick, and its pill carries what the Power Vote
            // paid (pickResults are base values, #136).
            const power = p.contestant_id === x2
            return scored && result?.correct === true ? (
              <CorrectVote key={p.id} name={name} points={result.points > 0 ? result.points + (power ? (ballotDouble?.points_earned ?? 0) : 0) : undefined} power={power} />
            ) : (
              <span
                key={p.id}
                className={`ballot-chip relative inline-flex shrink-0 items-center gap-1 rounded-md border border-cream-200 bg-white px-2 py-0.5 text-sm ${scored ? 'text-gray-500' : 'text-gray-700'}`}
              >
                {name}
                {power && <AdvantageStamp size={16} title="Power Vote" />}
              </span>
            )
          })
        )}
      </span>
      {!scored && (
        <span className="shrink-0 rounded-full bg-gold-50 px-2 py-0.5 text-[11px] text-gold-700">
          Awaiting
        </span>
      )}
    </div>
  )
}

// The ballot rail: every row is a disc on the rail, the castaway, then the
// rung's controls. The rail line itself is `.ballot-rail` in index.css.
const RAIL_ROW = 'grid min-h-[62px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-3'
const RAIL_NAME = 'block truncate font-display text-lg uppercase leading-tight'
const RAIL_SUB = 'block text-[10px] font-semibold uppercase tracking-[0.1em]'

/** A rung's disc on the ballot rail: what it pays, stepping down in size with
 *  the rank so the payout order reads before the names do. */
function RailNode({
  value,
  rank,
  tone,
}: {
  value: number | null
  /** 0 is the Power Vote, 1 the top pick. */
  rank: number
  tone: 'power' | 'power-open' | 'set' | 'open'
}) {
  const size = ['size-11 text-lg', 'size-10 text-[17px]', 'size-9 text-base', 'size-8 text-[15px]'][Math.min(rank, 3)]
  const paint = {
    power: 'bg-gold-500 text-forest-900',
    'power-open': 'border-2 border-dashed border-gold-500 bg-gold-50 text-gold-700',
    set: 'bg-terracotta-700 text-white',
    open: 'border-2 border-dashed border-terracotta-300 bg-white text-terracotta-600',
  }[tone]
  return (
    <b
      className={`ballot-rail__node relative z-[1] inline-grid place-items-center justify-self-center rounded-full font-display font-bold leading-none tabular-nums ring-4 ring-white ${size} ${paint}`}
    >
      {value ?? ''}
    </b>
  )
}

/** The castaway on a rail row, with the idol stamped on the Power Vote; a
 *  dashed ring when the rung is empty. */
function RailAvatar({
  contestant,
  name,
  power = false,
}: {
  contestant?: Contestant
  name: string | null
  power?: boolean
}) {
  if (name == null)
    return <span aria-hidden="true" className="size-9 shrink-0 rounded-full border-[1.5px] border-dashed border-paper-edge" />
  return (
    <span className="relative flex shrink-0">
      <ContestantAvatar
        name={name}
        imageUrl={contestant?.image_url ?? null}
        tribeColor={contestant?.tribe_color ?? null}
        tribeName={contestant?.tribe_name ?? null}
      />
      {power && <AdvantageStamp size={22} title="Power Vote" />}
    </span>
  )
}

function PicksSection({
  season,
  contestants,
  episodes,
  userId,
  plays,
  setPlays,
  pickResults,
  onOpenPicks,
  onFinaleProgress,
  onWorkingChange,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
  plays: AdvantagePlay[]
  setPlays: React.Dispatch<React.SetStateAction<AdvantagePlay[]>>
  pickResults: Map<string, PickResult>
  /** The open episode's saved picks, handed straight to the hero so it
   *  doesn't have to fetch them again (#673). */
  onOpenPicks?: (picks: EliminationPick[]) => void
  /** Live finale-bracket progress for the hero, forwarded to FinaleBallot. */
  onFinaleProgress?: (p: { filled: number; saved: boolean }) => void
  /** Whether the open ballot is mid-edit (or not yet submitted), for the
   *  page's stage lighting. */
  onWorkingChange?: (working: boolean) => void
}) {
  const [picksByEpisode, setPicksByEpisode] = useState<Map<string, EliminationPick[]>>(new Map())
  // The ballot is a ladder (#694): names in confidence order, first = surest.
  const [pending, setPending] = useState<Map<string, string[]>>(new Map())
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [errors, setErrors] = useState<Map<string, string>>(new Map())
  const [editing, setEditing] = useState(false)
  // The season's rung values, for the labels on the ladder. Older seasons
  // have none, and a refused read leaves the rungs unlabelled the same way.
  const rules = useQuery(pathQuery<RulesResponse>(`/league-seasons/${season.id}/rules`)).data
  /** What a rung (1 = top) or the Power Vote (0) pays this episode, or null
   *  when the season has no such value. */
  function rungValue(ep: Episode, rank: number): number | null {
    const key = rank === 0 ? 'power_vote' : `correct_elimination_${rank}`
    const row = rules?.prediction_scores?.find((score) => score.key === key)
    if (!row) return null
    const post = season.merge_episode != null && ep.episode_number >= season.merge_episode
    return post ? (row.postmerge_point_value ?? row.point_value) : row.point_value
  }

  // One keyed request for every episode's picks (#558/#803), not one per
  // episode: the fan-out grew a round trip every week of the season. The
  // History sheet reads the same path, so between them it is one request.
  const savedQ = useQuery(
    pathQuery<Record<string, EliminationPick[]>>(`/league-seasons/${season.id}/picks/${userId}`),
  )
  // The editable copy is seeded once, whichever way that read lands — a
  // refusal seeds an empty ballot, as its `.catch` did. It is not re-seeded
  // from later answers: the ballot below keeps this copy itself, through the
  // save's response and the re-read the play change triggers, and a seed
  // landing mid-edit would take names off the ladder as they were written.
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (seeded || savedQ.isPending) return
    const picksMap = new Map(Object.entries(savedQ.data ?? {}))
    setPicksByEpisode(picksMap)
    // Drop picks whose castaway was eliminated in an EARLIER episode (#96):
    // they can't come true, and leaving them wastes a vote slot and shows up
    // as a Double Vote target. Seeds the editable set with only live picks.
    // The Power Vote's name is a pick on the server (#673) but lives on
    // its own sheet here, so it never takes one of the ballot's slots.
    const elimEp = new Map(contestants.map((c) => [c.id, c.eliminated_in_episode]))
    const pendingMap = new Map<string, string[]>()
    for (const ep of episodes) {
      if (isEpisodeOpen(ep, season, episodes)) {
        const power = plays.find(
          (p) => p.episode_id === ep.id && p.advantage_type === 'double_vote_points',
        )?.target_contestant_id
        const saved = picksMap.get(ep.id) ?? []
        // The server answers in ladder order (#694).
        const live = saved.filter((p) => {
          const out = elimEp.get(p.contestant_id)
          return p.contestant_id !== power && (out == null || out >= ep.episode_number)
        })
        pendingMap.set(ep.id, live.map((p) => p.contestant_id))
      }
    }
    setPending(pendingMap)
    setSeeded(true)
    // plays, contestants and episodes are read as they are at the seed; a
    // later Power Vote change re-reads the one open ballot below instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seeded, savedQ.isPending, savedQ.data])

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const isOpen = (ep: Episode) => isEpisodeOpen(ep, season, episodes)

  /** Tap a name: onto the next free rung, or off the ladder if it is on one. */
  function togglePick(episodeId: string, contestantId: string, maxPicks: number) {
    setPending((prev) => {
      const list = prev.get(episodeId) ?? []
      const next = list.includes(contestantId)
        ? list.filter((id) => id !== contestantId)
        : list.length < maxPicks
          ? [...list, contestantId]
          : list
      return new Map(prev).set(episodeId, next)
    })
  }

  /** Move a name to a rung (0-based), the others closing up around it. */
  function moveName(episodeId: string, contestantId: string, toIndex: number) {
    setPending((prev) => {
      const list = (prev.get(episodeId) ?? []).filter((id) => id !== contestantId)
      const at = Math.max(0, Math.min(toIndex, list.length))
      list.splice(at, 0, contestantId)
      return new Map(prev).set(episodeId, list)
    })
  }

  const play = useWeeklyPlay(season, episodes, plays, setPlays, userId)

  // Power Vote (#673): the advantage played on the ballot. Designating a
  // name is the play — the idol drags onto a cast card, or the card's idol
  // slot is tapped — and it saves at once, the way the roster double does;
  // the server writes the name onto the ballot as an extra pick that pays
  // double. The regular ballot never counts it: the grid holds it as the
  // gold card, the pile leads with its slip, and the save sends it along
  // with the names so the server keeps it.
  const ballotPlay = play.play?.advantage_type === 'double_vote_points' ? play.play : undefined
  const powerTarget = ballotPlay?.target_contestant_id ?? null
  // The sheet is asking who gets the Power Vote.
  const [designating, setDesignating] = useState(false)
  const openEp = play.openEpisode
  // A submitted ballot with nothing open on it is at rest; anything else —
  // editing, designating, or no ballot yet — is work in progress.
  const openSaved = openEp
    ? (picksByEpisode.get(openEp.id) ?? []).some((p) => p.contestant_id !== powerTarget)
    : false
  const working = !openEp || !openSaved || editing || designating
  useEffect(() => {
    onWorkingChange?.(working)
  }, [working, onWorkingChange])

  function cancelEdit(episodeId: string) {
    const saved = picksByEpisode.get(episodeId) ?? []
    setPending((prev) =>
      new Map(prev).set(
        episodeId,
        saved.map((p) => p.contestant_id).filter((id) => id !== powerTarget),
      ),
    )
    setEditing(false)
  }

  // The regular ballot's cap this episode (#240); the Power Vote sits on top.
  const openStillIn = openEp
    ? contestants.filter(
        (c) => c.eliminated_in_episode == null || c.eliminated_in_episode >= openEp.episode_number,
      ).length
    : 0
  const openMax = openEp ? Math.max(0, Math.min(openEp.max_elimination_picks, openStillIn - 1)) : 0

  /** The idol lands on a name: the first time that is the play, saved as
   *  the roster double is; with a Power Vote already down it is a move. */
  /** `oldTo` is the rung (0-based) the current Power Vote's name takes when
   *  another name replaces it — the rung the new name came from, so the two
   *  swap — or the bottom of the ladder. */
  function designatePower(contestantId: string, oldTo: number | 'bottom' = 'bottom') {
    if (!openEp) return
    setDesignating(false)
    if (ballotPlay) {
      void movePower(contestantId, oldTo)
      return
    }
    // A regular vote becoming the Power Vote leaves the ladder in the same
    // paint, not a beat later when the re-read lands.
    setPending((prev) =>
      new Map(prev).set(
        openEp.id,
        (prev.get(openEp.id) ?? []).filter((id) => id !== contestantId),
      ),
    )
    // Any other play this week gives way, same as on the roster.
    play.replace('double_vote_points', contestantId)
  }

  /** Move the Power Vote to another name, like dragging the seal between
   *  roster rows. The ladder as shown (unsaved names included) saves with
   *  it: the picks POST moves the play and diffs the ladder in one request
   *  (#682), shown optimistically. The old name takes `oldTo` — the rung the
   *  new name left, or the bottom — when there is room for it. */
  async function movePower(newId: string, oldTo: number | 'bottom' = 'bottom') {
    if (!openEp || !ballotPlay) return
    const epId = openEp.id
    const oldId = ballotPlay.target_contestant_id
    const before = { picks: picksByEpisode.get(epId) ?? [], plays }
    const list = (pending.get(epId) ?? []).filter((id) => id !== oldId && id !== newId)
    const rungs = [...list]
    if (oldId && list.length < openMax) {
      rungs.splice(oldTo === 'bottom' ? list.length : Math.min(oldTo, list.length), 0, oldId)
    }
    const ids = [...rungs, newId]
    const optimisticPicks: EliminationPick[] = ids.map((id, index) => ({
      ...(before.picks.find((p) => p.contestant_id === id) ?? {
        id: `pending-${id}`,
        user_id: userId,
        episode_id: epId,
        contestant_id: id,
        created_at: '',
      }),
      rank: id === newId ? null : index + 1,
    }))
    setPicksByEpisode((prev) => new Map(prev).set(epId, optimisticPicks))
    setPlays((prev) =>
      prev.map((p) => (p.id === ballotPlay.id ? { ...p, target_contestant_id: newId } : p)),
    )
    setPending((prev) => new Map(prev).set(epId, rungs))
    lastTarget.current = newId
    onOpenPicks?.(optimisticPicks)
    setSubmitting(epId)
    try {
      const raw = await api.post<
        { picks: EliminationPick[]; play: AdvantagePlay | null } | EliminationPick[]
      >(`/league-seasons/${season.id}/episodes/${epId}/picks`, {
        contestant_ids: ids,
        doubled_contestant_id: newId,
      })
      const res = Array.isArray(raw) ? { picks: raw, play: null } : raw
      setPicksByEpisode((prev) => new Map(prev).set(epId, res.picks ?? optimisticPicks))
      if (res.play) {
        setPlays((prev) => [...prev.filter((p) => p.episode_id !== epId), res.play!])
        lastPlayId.current = res.play.id
      }
      onOpenPicks?.(res.picks ?? optimisticPicks)
    } catch (e) {
      setPicksByEpisode((prev) => new Map(prev).set(epId, before.picks))
      setPlays(before.plays)
      lastTarget.current = oldId
      onOpenPicks?.(before.picks)
      setErrors((prev) => new Map(prev).set(epId, e instanceof Error ? e.message : 'Move failed'))
    } finally {
      setSubmitting(null)
    }
  }

  /** Save the ballot; true when it went through.
   *
   *  One request: the picks POST carries the ×2 and answers with the play
   *  (created, moved, or dropped — a roster double gives way server-side).
   *  The saved sheet shows at once and the round trip catches up; a trip to
   *  the API is most of a second even when nothing goes wrong, and the
   *  roster path already reads that way. On failure the edit sheet comes
   *  back with the error. */
  async function submitPicks(episodeId: string): Promise<boolean> {
    setSubmitting(episodeId)
    setErrors((prev) => {
      const m = new Map(prev)
      m.delete(episodeId)
      return m
    })
    // Ladder order is the rank (#694); the Power Vote's name rides along so
    // the server's diff keeps it, and takes no rung.
    const rungs = pending.get(episodeId) ?? []
    const names = powerTarget ? [...rungs, powerTarget] : rungs
    const doubled = powerTarget

    const before = { picks: picksByEpisode.get(episodeId) ?? [], plays }
    const optimisticPicks: EliminationPick[] = names.map((id, index) => ({
      id: `pending-${id}`,
      user_id: userId,
      episode_id: episodeId,
      contestant_id: id,
      created_at: '',
      rank: id === powerTarget ? null : index + 1,
    }))
    setPicksByEpisode((prev) => new Map(prev).set(episodeId, optimisticPicks))
    setEditing(false)
    onOpenPicks?.(optimisticPicks)

    try {
      const raw = await api.post<
        { picks: EliminationPick[]; play: AdvantagePlay | null } | EliminationPick[]
      >(`/league-seasons/${season.id}/episodes/${episodeId}/picks`, {
        contestant_ids: names,
        doubled_contestant_id: doubled,
      })
      // A backend from before #682's response shape answers with the bare
      // list; read the play back the old way rather than blank the page.
      const res = Array.isArray(raw)
        ? {
            picks: raw,
            play:
              (
                await api
                  .get<AdvantagePlay[]>(`/league-seasons/${season.id}/advantage-plays/${userId}`)
                  .catch(() => [] as AdvantagePlay[])
              ).find(
                (p) => p.episode_id === episodeId && p.advantage_type === 'double_vote_points',
              ) ?? null,
          }
        : { picks: raw.picks ?? [], play: raw.play ?? null }
      setPicksByEpisode((prev) => new Map(prev).set(episodeId, res.picks))
      // The save never creates or moves the play now, but the server still
      // answers with it; take its word in case the week changed underneath.
      if (res.play) {
        setPlays((prev) => [...prev.filter((p) => p.episode_id !== episodeId), res.play!])
        lastPlayId.current = res.play.id
        lastTarget.current = res.play.target_contestant_id ?? null
      }
      // The Ballot beat shows the saved count, so it follows the save.
      onOpenPicks?.(res.picks)
      return true
    } catch (e) {
      setPicksByEpisode((prev) => new Map(prev).set(episodeId, before.picks))
      onOpenPicks?.(before.picks)
      setEditing(true)
      const msg = e instanceof Error ? e.message : 'Submit failed'
      setErrors((prev) => new Map(prev).set(episodeId, msg))
      return false
    } finally {
      setSubmitting(null)
    }
  }

  // Whenever the play changes underneath the ballot — named, moved, or taken
  // back — the saved ballot is re-read and the editable set follows it.
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const workingRef = useRef(working)
  workingRef.current = working
  const lastPlayId = useRef<string | undefined>(ballotPlay?.id)
  const lastTarget = useRef<string | null>(null)
  // A replace shows its optimistic row before the server has moved anything.
  // Re-read only once the real row is back — a move to the roster used to
  // re-read while the delete was still in flight and keep the doubled vote.
  const settled = !play.play?.id.startsWith('pending-')
  // Taking the Power Vote back drops its name to the top rung and the ladder
  // shifts down; whatever falls past the last rung leaves (#694). The server
  // does the same; this shows it in the paint the play disappears, so it
  // reads as one change rather than a beat later when the re-read lands.
  useLayoutEffect(() => {
    if (!settled || !openEp) return
    const gone = lastTarget.current
    lastTarget.current = ballotPlay?.target_contestant_id ?? null
    if (!gone || ballotPlay) return
    const epId = openEp.id
    const rows = picksByEpisode.get(epId) ?? []
    const goneRow = rows.find((p) => p.contestant_id === gone)
    const others = rows.filter((p) => p.contestant_id !== gone)
    const kept = (goneRow ? [goneRow, ...others] : others)
      .slice(0, openMax)
      .map((p, index) => ({ ...p, rank: index + 1 }))
    setPicksByEpisode((prev) => new Map(prev).set(epId, kept))
    setPending((prev) => {
      const list = (prev.get(epId) ?? []).filter((id) => id !== gone)
      return new Map(prev).set(epId, (goneRow ? [gone, ...list] : list).slice(0, openMax))
    })
    onOpenPicks?.(kept)
  }, [ballotPlay, settled, openEp, openMax, picksByEpisode, onOpenPicks])
  useEffect(() => {
    if (!openEp || !settled || lastPlayId.current === ballotPlay?.id) return
    lastPlayId.current = ballotPlay?.id
    const epId = openEp.id
    let stale = false
    void api
      .get<EliminationPick[]>(`/league-seasons/${season.id}/episodes/${epId}/picks/${userId}`)
      .then((picks) => {
        if (stale) return
        setPicksByEpisode((prev) => new Map(prev).set(epId, picks))
        // Same seed as the first load: a name already voted out can't come
        // true, so it doesn't take a slot in the editable set (#96), and the
        // Power Vote's name lives on its own sheet.
        const power = ballotPlay?.target_contestant_id ?? null
        const saved = picks
          .filter((p) => {
            const out = contestants.find((c) => c.id === p.contestant_id)?.eliminated_in_episode
            return p.contestant_id !== power && (out == null || out >= openEp.episode_number)
          })
          .map((p) => p.contestant_id)
        // An open sheet is the ballot as written, unsaved adds and removals
        // alike, so it survives the play changing under it; only a name that
        // just became the Power Vote leaves the ladder. Merging the saved
        // names back in brought cleared votes back. The sheet stays open if
        // it was: "cast your votes" continues after the Power Vote lands, and
        // only Save or Cancel closes it. A ballot at rest follows the server.
        const next = (workingRef.current ? (pendingRef.current.get(epId) ?? []) : saved).filter(
          (id) => id !== power,
        )
        setPending((prev) => new Map(prev).set(epId, next))
        onOpenPicks?.(picks)
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [ballotPlay?.id, ballotPlay?.target_contestant_id, settled, openEp, season.id, userId, contestants, onOpenPicks])

  // A ladder slip drags onto another rung to reorder, or up into the gold
  // rung to become the Power Vote (#694). Up/down buttons are the tap path.
  const dragName = useRef<string | null>(null)
  const {
    drag: ladderDrag,
    dragging: ladderDragging,
    start: startLadderDragRaw,
  } = useSealDrag({
    disabled: play.locked || play.busy || submitting != null,
    canDropOn: (id) => id.startsWith('rung:'),
    onDrop: (id) => {
      const name = dragName.current
      if (!name || !openEp) return
      const ladder = pending.get(openEp.id) ?? []
      if (name === powerTarget) {
        // The Power Vote's name dropped on a rung swaps with the name there.
        const other = ladder[Number(id.slice(5)) - 1]
        if (other) designatePower(other, Number(id.slice(5)) - 1)
      } else if (id === 'rung:pv') {
        designatePower(name, ladder.indexOf(name))
      } else {
        moveName(openEp.id, name, Number(id.slice(5)) - 1)
      }
    },
  })
  function startLadderDrag(contestantId: string) {
    return (e: React.PointerEvent) => {
      dragName.current = contestantId
      startLadderDragRaw(e)
    }
  }
  const dragLabel = (() => {
    const c = dragName.current ? contestantMap.get(dragName.current) : undefined
    return c ? displayName(c) : undefined
  })()
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

  // The finale replaces the weekly vote with the bracket (#86); it stays visible
  // after lock as the stamped ballot (#189). Computed up here so the empty-state
  // notice knows the finale counts as a current episode — otherwise it fired at
  // the finale, when every weekly episode is already scored.
  const finaleEp = episodes.find((e) => e.is_finale)
  const showFinale = Boolean(
    finaleEp && (nextOpen?.id === finaleEp.id || episodeClosed(finaleEp)),
  )

  const content = (
    <>
      <SealGhost drag={ladderDrag} label={dragLabel} />
      {!currentEp && !showFinale && (
        <Notice title="The season hasn’t started yet">
          Once the commissioner schedules the first episode, your tribe and the weekly play show up here.
        </Notice>
      )}

      {showFinale && finaleEp && (
        <FinaleBallot
          season={season}
          contestants={contestants}
          episodes={episodes}
          finaleEp={finaleEp}
          userId={userId}
          onProgress={onFinaleProgress}
        />
      )}

      {nextOpen &&
        !nextOpen.is_finale &&
        (() => {
          const ep = nextOpen
          const epPending = pending.get(ep.id) ?? []
          const episodeError = errors.get(ep.id)
          // The Power Vote's name is a pick on the server but not a regular
          // vote here: it leads the pile as the gold slip (#673).
          const savedPicks = (picksByEpisode.get(ep.id) ?? []).filter(
            (p) => p.contestant_id !== powerTarget,
          )
          const hasSavedPicks = savedPicks.length > 0
          const confirmed = hasSavedPicks && !editing && !designating
          // Order is part of the ballot now (#694): a reorder is a change.
          const savedOrder = savedPicks.map((pick) => pick.contestant_id)
          const dirty =
            epPending.length !== savedOrder.length ||
            epPending.some((contestantId, index) => savedOrder[index] !== contestantId)
          // You can never vote for every remaining castaway — cap at
          // (still in the game − 1). The Power Vote is on top of this.
          const stillIn = contestants.filter(
            (c) =>
              c.eliminated_in_episode == null ||
              c.eliminated_in_episode >= ep.episode_number,
          ).length
          const maxPicks = Math.max(0, Math.min(ep.max_elimination_picks, stillIn - 1))
          const powerContestant = powerTarget ? contestantMap.get(powerTarget) : undefined
          const powerName = powerContestant ? displayName(powerContestant) : '—'
          // The top rung is named for what it is; the rest count down (#694 review).
          // With a Power Vote on top, the rest count on from it.
          const ordinal = (rank: number) =>
            powerTarget
              ? `${['Second', 'Third', 'Fourth', 'Fifth', 'Sixth'][rank - 1] ?? `${rank + 1}th`} Vote`
              : rank === 1
                ? 'Top pick'
                : (['1st', '2nd', '3rd'][rank - 1] ?? `${rank}th`)
          const pts = (value: number | null) => (value == null ? '' : ` · ${value} pts`)
          const stripLink =
            'shrink-0 font-display text-[11px] font-bold uppercase tracking-wide text-forest-700 underline underline-offset-2 disabled:opacity-40'

          // The advantage on this tab (#673 follow-on): on offer, or
          // designating (the idol drags onto a name, or a name's idol slot is
          // tapped). Once played anywhere the strip leaves both tabs: the
          // gold card is the record, and the hero holds Undo.
          const advantageStrip =
            maxPicks === 0 || play.locked || play.play != null ? null : (
              // The Tribe tab's band. The negative margins cancel this
              // section's px-4 py-3.5 wrapper so the card sits flush under
              // the tab, at the same height and inset as on Tribe.
              <div className="-mx-4 -mt-3.5 border-b border-paper-line px-4 py-3">
              <div
                role="region"
                aria-label="Advantage"
                className="flex items-center gap-3 rounded-lg border border-gold-500/60 bg-gold-50 px-3 py-2.5 text-left text-xs text-forest-800"
              >
                {designating ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <b>Cast your votes, surest on top.</b> Tap a name, or move one up into the
                      gold rung, to make it your Power Vote
                      {rungValue(ep, 0) != null ? `, worth ${rungValue(ep, 0)}` : ''}.
                    </span>
                    <button type="button" onClick={() => setDesignating(false)} className={stripLink}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      Play your <b className="text-gold-700">advantage</b>{' '}
                      <span aria-hidden="true" className="inline-flex align-[-3px]">
                        <DoubleBadge size={16} />
                      </span>{' '}
                      on your ballot to receive a <b>Power Vote</b>, an <i>extra</i> vote worth more
                      points.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setDesignating(true)
                        setEditing(true)
                      }}
                      disabled={play.busy}
                      className="shrink-0 rounded-full border border-gold-500 bg-white px-2.5 py-1 font-display text-sm font-semibold text-forest-700 shadow-sm transition-colors hover:bg-gold-100 disabled:opacity-40"
                    >
                      Play it here
                    </button>
                  </>
                )}
              </div>
              </div>
            )

          // Only list castaways still in the game, grouped by tribe so the
          // field is easy to scan (#249). Already-eliminated players aren't
          // pickable, so they're hidden entirely rather than shown disabled.
          // Redemption Island residents are in the game but can't be voted
          // off a tribe, so they sit out the ballot too (#655) — from the
          // episode after the vote that sent them there, since that vote's own
          // week could fairly name them, and the API agrees (#726).
          const byTribe = new Map<string, Contestant[]>()
          for (const c of contestants) {
            if (c.eliminated_in_episode != null && c.eliminated_in_episode < ep.episode_number)
              continue
            const island = c.on_redemption_from_episode
            if (island != null && island < ep.episode_number) continue
            const key = c.tribe_name ?? 'No tribe'
            const group = byTribe.get(key)
            if (group) group.push(c)
            else byTribe.set(key, [c])
          }

          const grid = (
            <div className="mb-5 space-y-6">
              {[...byTribe.entries()].map(([tribeName, members]) => (
                <div key={tribeName}>
                  <div className="mb-3 flex items-center justify-center gap-2">
                    {members[0].tribe_color && (
                      <span
                        className="tribe-marker"
                        style={{ backgroundColor: members[0].tribe_color }}
                        aria-hidden="true"
                      />
                    )}
                    {/* h4, not h3 — the sheet's own title is the h3. */}
                    <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                      {tribeName}
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {members.map((c) => {
                      const name = displayName(c)
                      const isPower = c.id === powerTarget
                      const rungIndex = isPower ? -1 : epPending.indexOf(c.id)
                      const isSelected = rungIndex >= 0
                      const maxed = !isSelected && epPending.length >= maxPicks
                      // With the gold rung open, every live name is one tap
                      // from being the Power Vote — a regular vote included.
                      // The gold card taps off like any vote: the tap is the
                      // ladder's Remove, once the play is a real row.
                      const disabled =
                        play.busy ||
                        (isPower ? ballotPlay!.id.startsWith('pending-') : !designating && maxed)
                      const value = isSelected ? rungValue(ep, rungIndex + 1) : null
                      return (
                        <div key={c.id} className="relative rounded-xl">
                          <button
                            type="button"
                            onClick={() =>
                              isPower
                                ? play.takeBack(ballotPlay!)
                                : designating
                                  ? designatePower(c.id)
                                  : togglePick(ep.id, c.id, maxPicks)
                            }
                            disabled={disabled}
                            aria-pressed={designating ? undefined : isSelected || isPower}
                            aria-label={
                              isPower
                                ? `Remove Power Vote from ${name}`
                                : designating
                                  ? `Make ${name} your Power Vote`
                                  : isSelected
                                    ? `Remove vote for ${name}`
                                    : `Vote for ${name}`
                            }
                            className={[
                              'relative flex min-h-16 w-full min-w-0 items-center gap-2 rounded-xl border p-2 text-left text-sm font-medium transition-all',
                              isPower
                                ? 'border-gold-500 bg-gold-50 text-forest-900 shadow-sm ring-1 ring-gold-200'
                                : isSelected
                                  ? 'border-forest-500 bg-forest-50 text-forest-900 shadow-sm ring-1 ring-forest-200'
                                  : disabled
                                    ? 'border-paper-line bg-black/[.03] text-paper-ink-faded/60 cursor-not-allowed'
                                    : designating
                                      ? 'border-gold-500 bg-white text-paper-ink hover:bg-gold-50'
                                      : 'border-paper-edge bg-white text-paper-ink hover:border-forest-300',
                            ].join(' ')}
                          >
                            <ContestantAvatar name={name} imageUrl={c.image_url} tribeColor={c.tribe_color} tribeName={c.tribe_name} />
                            <span className="min-w-0 leading-tight">{name}</span>
                            {/* The rung the name holds and what it pays, or the
                                gold Power Vote mark; the idol stays on the
                                ladder above. */}
                            {(isSelected || isPower) && (
                              <span
                                className={`absolute right-1.5 top-1.5 inline-flex h-5 items-center justify-center rounded-full px-1.5 font-display text-[10px] font-bold uppercase tracking-wide ${
                                  isPower ? 'bg-gold-500 text-forest-900' : 'bg-forest-600 text-white'
                                }`}
                                aria-hidden="true"
                              >
                                {isPower
                                  ? `Power Vote${pts(rungValue(ep, 0)).replace(' pts', '')}`
                                  : `${ordinal(rungIndex + 1)}${pts(value).replace(' pts', '')}`}
                              </span>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )

          return (
            <>
            {advantageStrip}
            <div className="ballot-sheet">
              {/* The hero already names the episode and when it locks, so the
                  sheet opens on the ask alone. */}
              {confirmed ? (
                /* The record, once it is in: the same rail the ladder is drawn
                   on, each rung's disc carrying what it pays. The Power Vote is
                   the gold disc; an unfilled rung is an open one, so "2 of 3"
                   shows without a sentence. */
                <>
                  {rungValue(ep, 1) != null && (
                    <p
                      aria-hidden="true"
                      className="mb-0.5 w-11 text-center font-display text-[11px] font-bold uppercase leading-none tracking-[0.16em] text-terracotta-700"
                    >
                      Pts
                    </p>
                  )}
                  <ol aria-label="Your ballot, surest on top" className="ballot-rail text-left">
                    {ballotPlay && (
                      <li className={RAIL_ROW}>
                        <RailNode value={rungValue(ep, 0)} rank={0} tone="power" />
                        <span className="flex min-w-0 items-center gap-3">
                          <RailAvatar contestant={powerContestant} name={powerName} power />
                          <span className="min-w-0">
                            <span className={`${RAIL_NAME} font-semibold text-paper-ink`}>{powerName}</span>
                            <span className={`${RAIL_SUB} text-gold-700`}>Power Vote</span>
                          </span>
                        </span>
                      </li>
                    )}
                    {savedPicks.map((p, index) => {
                      const sc = contestantMap.get(p.contestant_id)
                      // Voted-for someone already eliminated earlier — no longer eligible (#5)
                      const stale =
                        sc?.eliminated_in_episode != null &&
                        sc.eliminated_in_episode < ep.episode_number
                      const rank = p.rank ?? index + 1
                      const name = sc ? displayName(sc) : '—'
                      return (
                        <li key={p.id} className={RAIL_ROW}>
                          <RailNode value={stale ? null : rungValue(ep, rank)} rank={rank} tone={stale ? 'open' : 'set'} />
                          <span className="flex min-w-0 items-center gap-3">
                            <RailAvatar contestant={sc} name={name} />
                            <span className="min-w-0">
                              <span
                                className={`${RAIL_NAME} font-semibold ${
                                  stale ? 'text-paper-ink-faded line-through' : 'text-paper-ink'
                                }`}
                              >
                                {name}
                              </span>
                              <span className={`${RAIL_SUB} text-paper-ink-faded`}>
                                {ordinal(rank)}
                                {stale && ' · out'}
                              </span>
                            </span>
                          </span>
                        </li>
                      )
                    })}
                    {Array.from({ length: Math.max(0, maxPicks - savedPicks.length) }, (_, i) => {
                      const rank = savedPicks.length + i + 1
                      return (
                        <li key={`open-${rank}`} className={RAIL_ROW}>
                          <RailNode value={rungValue(ep, rank)} rank={rank} tone="open" />
                          <span className="flex min-w-0 items-center gap-3">
                            <RailAvatar name={null} />
                            <span className="min-w-0">
                              <span className={`${RAIL_NAME} font-medium text-paper-ink-faded`}>Open</span>
                              <span className={`${RAIL_SUB} text-paper-ink-faded`}>{ordinal(rank)}</span>
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </>
              ) : (
                <>
                  <p className="mb-1 flex items-baseline justify-between gap-3 text-left text-sm text-stone-600">
                    Rank your picks. The top pays most.
                    <span aria-live="polite" className="ballot-sheet__count whitespace-nowrap">
                      {epPending.length} of {maxPicks}
                    </span>
                  </p>
                  {/* The ladder (#694) on the rail: each rung's disc is what it
                      pays, surest on top. A name drags to another rung; the
                      arrows are the tap path. The gold disc is the Power Vote. */}
                  <ol aria-label="Your ballot, surest on top" className="ballot-rail mb-2 text-left">
                    {(ballotPlay || designating) && (
                      <li
                        data-drop-id="rung:pv"
                        className={`${RAIL_ROW} data-[drag-over]:ring-2 data-[drag-over]:ring-inset data-[drag-over]:ring-gold-500`}
                      >
                        <RailNode value={rungValue(ep, 0)} rank={0} tone={ballotPlay ? 'power' : 'power-open'} />
                        {ballotPlay && powerTarget ? (
                          <>
                            <span
                              onPointerDown={play.locked ? undefined : startLadderDrag(powerTarget)}
                              className={`flex min-w-0 items-center gap-3 ${play.locked ? '' : 'cursor-grab touch-none active:cursor-grabbing'}`}
                              style={{ opacity: ladderDragging && dragName.current === powerTarget ? 0.3 : 1 }}
                            >
                              <RailAvatar contestant={powerContestant} name={powerName} power />
                              <span className="min-w-0">
                                <span className={`${RAIL_NAME} font-semibold text-paper-ink`}>{powerName}</span>
                                <span className={`${RAIL_SUB} text-gold-700`}>Power Vote</span>
                              </span>
                            </span>
                            {/* The same controls as every rung: down swaps with
                                1st, remove takes the advantage back. */}
                            <span className="inline-flex shrink-0 items-center gap-0.5">
                              <button
                                type="button"
                                disabled
                                aria-label={`Move ${powerName} up`}
                                className="inline-flex size-8 items-center justify-center rounded-full text-forest-700 disabled:opacity-25"
                              >
                                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => epPending[0] && designatePower(epPending[0], 0)}
                                disabled={epPending.length === 0 || play.busy || submitting != null}
                                aria-label={`Move ${powerName} down`}
                                className="inline-flex size-8 items-center justify-center rounded-full text-forest-700 hover:bg-forest-50 disabled:opacity-25"
                              >
                                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => play.takeBack(ballotPlay)}
                                disabled={play.busy || ballotPlay.id.startsWith('pending-')}
                                aria-label={`Remove ${powerName}`}
                                className="inline-flex size-8 items-center justify-center rounded-full text-paper-ink-faded hover:bg-terracotta-50 hover:text-terracotta-700 disabled:opacity-25"
                              >
                                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                              </button>
                            </span>
                          </>
                        ) : (
                          // Empty: the dashed gold disc says it; the strip says what to do.
                          <span className="flex min-w-0 items-center gap-3">
                            <RailAvatar name={null} />
                            <span className={`${RAIL_SUB} text-gold-700`}>Power Vote</span>
                          </span>
                        )}
                      </li>
                    )}
                    {Array.from({ length: maxPicks }, (_, index) => {
                      const id = epPending[index]
                      const rc = id ? contestantMap.get(id) : undefined
                      const rungName = rc ? displayName(rc) : null
                      return (
                        <li
                          key={index}
                          data-drop-id={`rung:${index + 1}`}
                          className={`${RAIL_ROW} data-[drag-over]:ring-2 data-[drag-over]:ring-inset data-[drag-over]:ring-gold-500`}
                        >
                          <RailNode value={rungValue(ep, index + 1)} rank={index + 1} tone={id && rungName ? 'set' : 'open'} />
                          {id && rungName ? (
                            <>
                              <span
                                onPointerDown={play.locked ? undefined : startLadderDrag(id)}
                                className={`flex min-w-0 items-center gap-3 ${play.locked ? '' : 'cursor-grab touch-none active:cursor-grabbing'}`}
                                style={{ opacity: ladderDragging && dragName.current === id ? 0.3 : 1 }}
                              >
                                <RailAvatar contestant={rc} name={rungName} />
                                <span className="min-w-0">
                                  <span className={`${RAIL_NAME} font-semibold text-paper-ink`}>{rungName}</span>
                                  <span className={`${RAIL_SUB} text-paper-ink-faded`}>{ordinal(index + 1)}</span>
                                </span>
                              </span>
                              <span className="inline-flex shrink-0 items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    index === 0 ? designatePower(id, 0) : moveName(ep.id, id, index - 1)
                                  }
                                  disabled={
                                    (index === 0 && !(designating || ballotPlay)) ||
                                    play.busy ||
                                    (index === 0 && submitting != null)
                                  }
                                  aria-label={`Move ${rungName} up`}
                                  className="inline-flex size-8 items-center justify-center rounded-full text-forest-700 hover:bg-forest-50 disabled:opacity-25"
                                >
                                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveName(ep.id, id, index + 1)}
                                  disabled={index >= epPending.length - 1 || play.busy}
                                  aria-label={`Move ${rungName} down`}
                                  className="inline-flex size-8 items-center justify-center rounded-full text-forest-700 hover:bg-forest-50 disabled:opacity-25"
                                >
                                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => togglePick(ep.id, id, maxPicks)}
                                  disabled={play.busy}
                                  aria-label={`Remove ${rungName}`}
                                  className="inline-flex size-8 items-center justify-center rounded-full text-paper-ink-faded hover:bg-terracotta-50 hover:text-terracotta-700 disabled:opacity-25"
                                >
                                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                                </button>
                              </span>
                            </>
                          ) : (
                            <span className="flex min-w-0 items-center gap-3">
                              <RailAvatar name={null} />
                              <span className="min-w-0">
                                <span className="block text-sm text-paper-ink-faded">
                                  {index === epPending.length ? 'Tap a name below.' : ''}
                                </span>
                                <span className={`${RAIL_SUB} text-paper-ink-faded`}>{ordinal(index + 1)}</span>
                              </span>
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </>
              )}
            </div>
            {/* The margins cancel this section's padding. Save folds the
                picker into the foot, and Edit folds it back out, rather than
                swapping one for the other in a frame (#826). */}
            <div className="-mx-4 -mb-3.5">
            <div
              className="collapse-rows"
              data-open={!confirmed}
              inert={confirmed}
              aria-hidden={confirmed}
            >
              <div>
              {/* The picker sits in a recessed tray under the rail, so the
                  ballot reads as the thing on top and the picker as where the
                  names come from. */}
              <div className="ballot-tray px-4 pt-4 pb-3.5 text-center">
                <p className="ballot-sheet__count mb-4">Tap a castaway to add them</p>
                {grid}
                {episodeError && <p role="alert" className="mb-3 rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-700">{episodeError}</p>}
                <div className="mx-auto flex max-w-xs gap-2">
                  <button
                    type="button"
                    onClick={() => (dirty ? void submitPicks(ep.id) : setEditing(false))}
                    disabled={submitting === ep.id || (!dirty && !hasSavedPicks)}
                    className="min-h-11 flex-1 rounded-lg bg-jade-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-jade-700 disabled:opacity-40"
                  >
                    {submitting === ep.id ? 'Saving…' : dirty || !hasSavedPicks ? 'Save ballot' : 'Done'}
                  </button>
                  {hasSavedPicks && (
                    <button
                      type="button"
                      onClick={() => {
                        setDesignating(false)
                        cancelEdit(ep.id)
                      }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:border-gray-400 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              </div>
            </div>
            <div
              className="collapse-rows"
              data-open={confirmed}
              inert={!confirmed}
              aria-hidden={!confirmed}
            >
              <div>
              {/* The lane's own foot, where Tribe keeps Edit tribe. */}
              <div className="lane-card__foot mt-2 justify-center gap-2.5 text-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold text-jade-700">
                  <svg viewBox="0 0 24 24" className="size-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  Submitted
                </span>
                <span aria-hidden="true" className="size-[3px] rounded-full bg-paper-edge" />
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="font-semibold text-terracotta-700 underline underline-offset-2 hover:text-terracotta-800"
                >
                  Edit ballot
                </button>
              </div>
              </div>
            </div>
            </div>
            </>
          )
        })()}

      {currentEp && !isOpen(currentEp) && (
        <BallotRecord
          ep={currentEp}
          picks={picksByEpisode.get(currentEp.id) ?? []}
          pickResults={pickResults}
          plays={plays}
          contestants={contestants}
          current
        />
      )}
    </>
  )

  return (
    <div className="px-4 py-3.5">
      {play.error && (
        <p role="alert" className="mb-3 text-sm text-terracotta-600">
          {play.error}
        </p>
      )}
      {content}
    </div>
  )
}

// ─── Finale ballot (final week's weekly vote) ───────────────────────────────

function FinaleBallot({
  season,
  contestants,
  episodes,
  finaleEp,
  userId,
  onProgress,
  actuals,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  finaleEp: Episode
  userId: string
  /** Real placements, once the finale is scored: the bracket marks each pick. */
  actuals?: FinaleActuals
  /** Report bracket progress up so the hero tracks picks live. `saved` is true
   *  only while showing a locked-in ballot (not a live draft). */
  onProgress?: (p: { filled: number; saved: boolean }) => void
}) {
  const [finalFour, setFinalFour] = useState<string[]>([])
  const [finalThree, setFinalThree] = useState<string[]>([])
  const [winner, setWinner] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Saved ballot shows as a display state with Edit until lock (#189)
  const [hasSaved, setHasSaved] = useState(false)
  const [editing, setEditing] = useState(false)

  const locked = !isEpisodeOpen(finaleEp, season, episodes)

  // Alive at the finale: never-eliminated OR eliminated in the finale itself —
  // the ballot predicts the finale's bracket, so they stay listed even when
  // results land before the window closes (matches the server).
  const aliveAtFinale = useCallback(
    (id: string) => {
      const c = contestants.find((x) => x.id === id)
      return (
        !!c &&
        (c.eliminated_in_episode == null ||
          c.eliminated_in_episode === finaleEp.episode_number)
      )
    },
    [contestants, finaleEp.episode_number],
  )

  // The saved bracket, seeded once into the editable copy above: a refusal
  // (404, nothing submitted yet) starts the form empty, as its `.catch` did,
  // and the save below keeps this copy itself from then on.
  const savedQ = useQuery(
    pathQuery<FinalePrediction>(`/league-seasons/${season.id}/finale-predictions/${userId}`),
  )
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (seeded || savedQ.isPending) return
    setSeeded(true)
    const pred = savedQ.data
    if (!pred) return
    // Drop anyone booted since the ballot was saved: the rounds below only
    // list the living, so a dead pick left in state is unremovable and the
    // server rejects the whole ballot on submit.
    const stillIn = (ids: string[] | null) => (ids ?? []).filter((id) => aliveAtFinale(id))
    const f4 = stillIn(pred.final_four_contestant_ids)
    const f3 = stillIn(pred.final_three_contestant_ids)
    const w = pred.winner_contestant_id && aliveAtFinale(pred.winner_contestant_id)
      ? pred.winner_contestant_id
      : ''
    setFinalFour(f4)
    setFinalThree(f3)
    setWinner(w)
    setHasSaved(f4.length > 0 || f3.length > 0 || Boolean(w))
  }, [seeded, savedQ.isPending, savedQ.data, aliveAtFinale])

  // Report bracket progress to the hero on every pick change. `saved` is true
  // only while showing a committed ballot, so the hero's "all set" waits on a
  // lock-in even though its count follows the live draft.
  useEffect(() => {
    onProgress?.({
      filled: finalFour.length + finalThree.length + (winner ? 1 : 0),
      saved: locked || (hasSaved && !editing),
    })
  }, [finalFour, finalThree, winner, locked, hasSaved, editing, onProgress])

  const alive = contestants.filter((c) => aliveAtFinale(c.id))
  const byId = new Map(contestants.map((c) => [c.id, c]))
  // The bracket narrows: your Final 3 comes from your Final 4, the winner and
  // the immunity winner from within those. Toggling someone out of the wider
  // round drops them from the narrower ones too, so a ballot can't contradict
  // itself.
  function toggleFinalFour(id: string) {
    setSaved(false)
    if (finalFour.includes(id)) {
      setFinalFour(finalFour.filter((x) => x !== id))
      setFinalThree(finalThree.filter((x) => x !== id))
      if (winner === id) setWinner('')
    } else if (finalFour.length < 4) {
      setFinalFour([...finalFour, id])
    }
  }
  function toggleFinalThree(id: string) {
    setSaved(false)
    if (finalThree.includes(id)) {
      setFinalThree(finalThree.filter((x) => x !== id))
      if (winner === id) setWinner('')
    } else if (finalThree.length < 3) {
      setFinalThree([...finalThree, id])
    }
  }

  async function submitBallot() {
    setSubmitting(true)
    setError(null)
    setSaved(false)
    try {
      await api.post<FinalePrediction>(`/league-seasons/${season.id}/finale-predictions`, {
        final_four_contestant_ids: finalFour,
        final_three_contestant_ids: finalThree,
        winner_contestant_id: winner || null,
      })
      setSaved(true)
      setHasSaved(finalFour.length > 0 || finalThree.length > 0 || Boolean(winner))
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mb-6 p-4 bg-white border border-cream-200 rounded-xl">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-gray-900">
          Finale · Ep {finaleEp.episode_number}
        </h3>
        <LockBadge
          lockAt={finaleEp.picks_lock_at}
          scored={finaleEp.status === 'scored'}
        />
      </div>
      <p className="mb-2"><RuleLink anchor="finale">How the bracket scores</RuleLink></p>

      {locked && !hasSaved ? (
        <p className="text-sm text-gray-600 mt-2">
          No ballot submitted — the window has closed.
        </p>
      ) : locked || (hasSaved && !editing) ? (
        <div className="mt-2 p-5 bg-jade-50 border-2 border-jade-500 rounded-xl">
          <div className="flex flex-col items-center">
            <VoteMark className="w-10 h-10" />
            <p className="font-semibold text-jade-800 mt-1 mb-3">
              {locked ? 'Finale ballot locked' : 'Finale ballot in'}
            </p>
          </div>
          <FinaleBracket
            finalFour={finalFour}
            finalThree={finalThree}
            winner={winner}
            byId={byId}
            actuals={actuals}
          />
          {!locked && (
            <div className="text-center">
              <button
                onClick={() => {
                  setEditing(true)
                  setSaved(false)
                }}
                className="ruled-action mt-4"
              >
                Edit ballot
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-5 mb-4 mt-4">
            <BracketRound
              label="Final 4"
              hint={`Who reaches the fire-making round · ${finalFour.length}/4`}
              options={alive}
              selected={finalFour}
              onToggle={toggleFinalFour}
            />
            <BracketRound
              label="Final 3"
              hint={
                finalFour.length === 0
                  ? 'Pick your Final 4 first'
                  : `Who survives to the final tribal · ${finalThree.length}/3`
              }
              options={finalFour.map((id) => byId.get(id)).filter(Boolean) as Contestant[]}
              selected={finalThree}
              onToggle={toggleFinalThree}
            />
            <BracketPick
              label="Winner"
              hint={finalThree.length === 0 ? 'Pick your Final 3 first' : ''}
              options={finalThree.map((id) => byId.get(id)).filter(Boolean) as Contestant[]}
              value={winner}
              onChange={(id) => {
                setWinner(id)
                setSaved(false)
              }}
            />
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

/** A multi-select bracket round: tap castaways to add them to the slate, tap
 *  again to remove. Caps are enforced by the caller's toggle. */
function BracketRound({
  label,
  hint,
  options,
  selected,
  onToggle,
}: {
  label: string
  hint: string
  options: Contestant[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div>
      <div className="border-l-2 border-terracotta-500 pl-2 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-gray-400 pl-2">—</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {options.map((c) => {
            const on = selected.includes(c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onToggle(c.id)}
                aria-pressed={on}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left text-sm font-medium transition-colors ${
                  on
                    ? 'border-jade-500 bg-jade-50 text-jade-900'
                    : 'border-cream-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <ContestantAvatar
                  name={displayName(c)}
                  imageUrl={c.image_url}
                  size="sm"
                  tribeColor={c.tribe_color}
                  tribeName={c.tribe_name}
                />
                <span className="min-w-0 truncate">{displayName(c)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** A single-select bracket pick (winner, final immunity). */
function BracketPick({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string
  hint: string
  options: Contestant[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div>
      <div className="border-l-2 border-gold-500 pl-2 mb-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
        {hint && <p className="text-xs text-gray-500">{hint}</p>}
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-gray-400 pl-2">—</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((c) => {
            const on = value === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(on ? '' : c.id)}
                aria-pressed={on}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left text-sm font-medium transition-colors ${
                  on
                    ? 'border-gold-500 bg-gold-50 text-forest-900'
                    : 'border-cream-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <ContestantAvatar
                  name={displayName(c)}
                  imageUrl={c.image_url}
                  size="sm"
                  tribeColor={c.tribe_color}
                  tribeName={c.tribe_name}
                />
                <span className="min-w-0 truncate">{displayName(c)}</span>
              </button>
            )
          })}
        </div>
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
  onStartSoleSurvivor,
  wait = false,
}: {
  season: Season
  contestants: Contestant[]
  episodes: Episode[]
  userId: string
  /** Start the pick: the roster rows answer it, the way Swap works (#164). */
  onStartSoleSurvivor?: () => void
  /** Another card is up or owed (results, first loss): the moment waits. */
  wait?: boolean
}) {
  // The name-your-Sole-Survivor moment (#164): a one-time popup that explains
  // the stakes, then leaves the button pulsing. Once per browser.
  const [naming, setNaming] = useState<'popup' | 'nudge' | null>(null)

  // The page's roster read, shared (#816): a pre-lock swap can't leave a
  // removed castaway designated here or hide the new pick, because the write
  // that made it named this path (#180 follow-up).
  const rosterPath = `/league-seasons/${season.id}/roster/${userId}`
  const rosterQ = useQuery(pathQuery<RosterPick[]>(rosterPath))
  const roster = rosterQ.data ?? []
  const loaded = rosterQ.isFetched

  const nameOf = (id: string) => {
    const c = contestants.find((c) => c.id === id)
    return c ? displayName(c) : '—'
  }
  const designee = roster.find((p) => p.is_sole_survivor)

  const lockEp = swapLockEpisodeNumber(season)
  const lockEpisode = episodes.find((e) => e.episode_number === lockEp)
  const windowOpen = ssDesignationOpen(season, episodes)

  const namingKey = `mytribe.name-sole-survivor.${season.id}`
  useEffect(() => {
    if (!loaded || !windowOpen || designee || naming != null || wait) return
    try {
      if (localStorage.getItem(namingKey) === '1') return
      localStorage.setItem(namingKey, '1')
    } catch {
      return
    }
    setNaming('popup')
    // Bring the button to mid-screen so it's in view once the popup's dim lifts.
    document.querySelector('.ss-line')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    // Fires once per browser; `naming` is only read to not re-fire mid-way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, windowOpen, designee, namingKey, wait])

  const clearDesignation = useApiMutation({
    write: () => api.quiet.delete(`/league-seasons/${season.id}/sole-survivor`),
    invalidates: [rosterPath, `/league-seasons/${season.id}/scoring-breakdown/${userId}`],
  })
  const saving = clearDesignation.isPending
  const error = clearDesignation.error?.message ?? null

  // Locked: the roster row already carries the Sole Survivor tag, so a second
  // box restating a decision nobody can change any more is just noise (#487).
  if (!windowOpen) return null

  // One box for both states, so naming someone folds the rules row away and
  // shrinks the badge in place rather than swapping in a shorter box (#826).
  // Unnamed: tap Choose and the screen dims onto your Tribe, the way a Swap
  // works (#164); the one-time popup explains the stakes and leaves Choose
  // pulsing. Named: the name and an Undo.
  return (
    <div className="rounded-xl border-2 border-gold-300 bg-gradient-to-br from-gold-50 to-gold-100/70 px-4 py-2.5 shadow-sm">
      {/* The badge anchors both rows: label + Choose on the first, the rules
          link + the lock chip on the second — rules under the label, the lock
          right-aligned under Choose. One row isn't reachable at phone width with
          the full lock timestamp. */}
      <div className="flex items-center gap-3">
        <SoleSurvivorTorch
          className={`${designee ? 'h-8' : 'h-10'} aspect-[2/3] shrink-0 motion-safe:transition-[height] motion-safe:duration-500`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {designee ? (
              <p className="min-w-0 flex-1 text-sm text-paper-ink">
                <span className="font-display text-xs font-bold uppercase tracking-wide text-gold-800">
                  Sole Survivor
                </span>
                {' — '}
                <span className="font-medium text-gray-900">{nameOf(designee.contestant_id)}</span>
              </p>
            ) : (
              <p className="min-w-0 flex-1 font-display text-sm font-bold uppercase tracking-wide text-gold-800">
                Sole Survivor
              </p>
            )}
            {designee ? (
              <button
                type="button"
                onClick={() => clearDesignation.mutate(undefined)}
                disabled={saving}
                className="shrink-0 font-display text-xs font-bold uppercase tracking-wide text-forest-700 underline underline-offset-2 disabled:opacity-40"
              >
                Undo
              </button>
            ) : (
              <button
                type="button"
                aria-label="Name your Sole Survivor"
                onClick={() => {
                  setNaming(null)
                  onStartSoleSurvivor?.()
                }}
                data-pulse={naming != null || undefined}
                className="ss-line shrink-0 rounded-full border border-gold-500 bg-gold-50 px-4 py-1.5 font-display text-sm font-semibold text-forest-700 shadow-sm transition-colors hover:bg-gold-100"
              >
                Choose
              </button>
            )}
          </div>
          <div className="collapse-rows" data-open={!designee} inert={!!designee} aria-hidden={!!designee}>
            <div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <RuleLink anchor="sole-survivor">How it works</RuleLink>
                {lockEpisode && (
                  <LockBadge
                    lockAt={lockEpisode.picks_lock_at}
                    scored={lockEpisode.status === 'scored'}
                    bare
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-terracotta-600" role="alert">{error}</p>}
      {naming === 'popup' &&
        createPortal(
          <Moment titleId="name-ss-title" title="Choose your Sole Survivor" onClose={() => setNaming('nudge')}>
            <p className="mt-3 text-sm text-paper-ink">
              Any points they earn in the finale are worth an extra 50%.
            </p>
            <SoleSurvivorExample className="mt-4" />
            <button
              type="button"
              onClick={() => setNaming('nudge')}
              className="mt-5 rounded-full border border-gold-500 bg-gold-50 px-4 py-1.5 font-display text-sm font-semibold text-forest-700 shadow-sm hover:bg-gold-100"
            >
              Got it
            </button>
          </Moment>,
          document.body,
        )}
    </div>
  )
}
