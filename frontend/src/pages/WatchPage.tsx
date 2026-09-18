import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ColdStart } from '../components/ColdStart'
import { ContestantAvatar, ELIMINATED_DIM, ELIMINATED_STRIKE } from '../components/ContestantAvatar'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { useAuth } from '../auth/useAuth'
import { api } from '../lib/api'
import { rankCast } from '../lib/cast'
import { airingEpisode } from '../lib/episodes'
import { pathQuery, useActiveSeason } from '../lib/queries'
import type { CastMember, Episode, RulesResponse } from '../types'
import {
  chipEventsForTab,
  convertWinsToTeam,
  deriveScoringEvents,
  emptyState,
  shortLabel,
  suggestedBoot,
  voteTally,
  WIN_EVENTS,
  type TabKey,
  type WatchState,
} from '../lib/watchTracker'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'wins', label: 'Immunity & reward' },
  { key: 'tribal', label: 'Tribal' },
  { key: 'extras', label: 'Extras' },
  { key: 'camp', label: 'Camp' },
  { key: 'final', label: 'Final tribal' },
  { key: 'notes', label: 'Notes' },
]

const storageKey = (episodeId: string) => `tk-watch-${episodeId}`

function groupByTribe(members: CastMember[]) {
  const groups: { name: string | null; color: string | null; people: CastMember[] }[] = []
  const idx = new Map<string, number>()
  for (const m of members) {
    const key = m.tribe_name ?? '—'
    if (!idx.has(key)) {
      idx.set(key, groups.length)
      groups.push({ name: m.tribe_name, color: m.tribe_color, people: [] })
    }
    groups[idx.get(key) as number].people.push(m)
  }
  return groups
}

/** Commissioner scratchpad for scoring an episode live (#737). Danny watches
 *  and records here; survivoR validates it Friday. Everything stays in this
 *  browser (localStorage per episode) — it hands off to admin, writes nothing. */
export function WatchPage() {
  const { profile } = useAuth()
  const [watch, setWatch] = useState<WatchState>(emptyState)

  const [tab, setTab] = useState<TabKey>('wins')
  const [chipSel, setChipSel] = useState<Record<string, string>>({})
  const [openVoters, setOpenVoters] = useState<Set<string>>(new Set())
  const [voterScope, setVoterScope] = useState<Record<string, 'tribe' | 'all'>>({})
  const [predictMode, setPredictMode] = useState(false)
  const [openSlot, setOpenSlot] = useState<{ tier: 'finalFour' | 'finalThree' | 'winner'; index: number } | null>(null)
  const [loaded, setLoaded] = useState(false)
  // Which episode this sitting records, chosen once (below) and then held.
  const [episodeId, setEpisodeId] = useState<string | null>(null)
  const [synced, setSynced] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const seasonQ = useActiveSeason()
  const season = seasonQ.season
  const castQ = useQuery(pathQuery<CastMember[]>(season ? `/seasons/${season.season_id}/cast` : null))
  const episodesQ = useQuery(pathQuery<Episode[]>(season ? `/seasons/${season.season_id}/episodes` : null))
  const rulesQ = useQuery(pathQuery<RulesResponse>(season ? `/league-seasons/${season.id}/rules` : null))
  const cast = castQ.data ?? []
  const rules = rulesQ.data ?? null

  // Latch the episode the first time the schedule lands, and never move it.
  // `airingEpisode` answers against the clock and the episode's status, so a
  // derived target would move mid-sitting — when tonight's lock passes, or the
  // moment Admin scores the episode — and write the night's work to whichever
  // episode it moved to.
  useEffect(() => {
    if (episodeId || !season || !episodesQ.data) return
    setEpisodeId((airingEpisode(episodesQ.data, season) ?? episodesQ.data.at(-1))?.id ?? null)
  }, [episodeId, season, episodesQ.data])
  const episode = episodesQ.data?.find((e) => e.id === episodeId) ?? null

  // Server is the source of truth (cross-device); the scoring ritual reads it.
  const savedQ = useQuery(
    pathQuery<{ data: Partial<WatchState> }>(
      season && episodeId ? `/league-seasons/${season.id}/episodes/${episodeId}/watch` : null,
    ),
  )

  const loading =
    seasonQ.isLoading ||
    (season != null && (castQ.isPending || episodesQ.isPending || rulesQ.isPending)) ||
    // The one render between the schedule landing and the latch above.
    (episodesQ.data != null && episodesQ.data.length > 0 && episodeId == null) ||
    // The saved copy is the forgiven read here — it is not in the error gate
    // below, because nothing saved yet (a 404) or offline falls back to this
    // device's copy. So it waits on "has it answered", not on "is it pending":
    // a refetch of a query holding no data resets it to pending, and an errored
    // query is always stale, so on `isPending` every window focus would flash
    // the loader over a night's tracking — mid-episode, which is exactly when
    // the phone is being picked up and put down.
    (episodeId != null && !savedQ.isFetched)
  const error = seasonQ.error ?? castQ.error ?? episodesQ.error ?? rulesQ.error

  // Seed the editable tracker once, when the saved copy has answered either way.
  // A refusal (offline, nothing saved yet) falls back to this device's copy.
  // `isPending` is the honest test for a *first* answer, and `loaded` latches,
  // so the reset a later refetch causes can't re-seed over the night's work.
  useEffect(() => {
    if (!episodeId || loaded || savedQ.isPending) return
    const server = savedQ.data?.data
    let initial: WatchState | null =
      server && Object.keys(server).length ? { ...emptyState(), ...server } : null
    if (!initial) {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey(episodeId)) ?? 'null') as WatchState | null
        if (stored) initial = { ...emptyState(), ...stored }
      } catch {
        // Unreadable scratchpad, start clean.
      }
    }
    if (initial) setWatch(initial)
    setLoaded(true)
  }, [episodeId, loaded, savedQ.isPending, savedQ.data])

  // Ids, not the rows they came from: a write invalidates every query (#814),
  // and depending on the refetched episode object would make this effect save
  // again on its own answer.
  const leagueSeasonId = season?.id
  useEffect(() => {
    if (!episodeId || !leagueSeasonId || !loaded) return
    try {
      localStorage.setItem(storageKey(episodeId), JSON.stringify(watch))
    } catch {
      // Storage unavailable — the tracker still works for this sitting.
    }
    // Debounced so a burst of taps is one write. Server is authoritative;
    // localStorage above is the offline fallback.
    setSynced('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      api
        .put(`/league-seasons/${leagueSeasonId}/episodes/${episodeId}/watch`, { data: watch })
        .then(() => setSynced('saved'))
        .catch(() => setSynced('error'))
    }, 800)
    return () => clearTimeout(saveTimer.current)
  }, [episodeId, leagueSeasonId, watch, loaded])

  // No pre/post-merge toggle: the tribes flatten on their own at the merge,
  // since the merge tribe is one tribe. postMerge only picks the point rate.
  const active = useMemo(
    () => rankCast(castQ.data ?? []).filter((c) => c.eliminated_in_episode == null),
    [castQ.data],
  )
  const groups = useMemo(() => groupByTribe(active), [active])
  const recorded = deriveScoringEvents(watch).length + watch.boots.length

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load the episode">{error.message}</Notice>
  if (!profile?.is_admin)
    return (
      <Notice tone="error" title="Commissioner access required">
        Your account is not authorized to score the league.
      </Notice>
    )
  if (!season || !episode) return <ColdStart />

  const postMerge = season.merge_episode != null && episode.episode_number >= season.merge_episode

  // ---- mutators ----
  const makeTeamWin = (individualType: string, teamType: string) =>
    setWatch((w) => ({ ...w, wins: convertWinsToTeam(w.wins, individualType, teamType) }))
  const toggleWin = (eventType: string, id: string) =>
    setWatch((w) => {
      const cur = new Set(w.wins[eventType] ?? [])
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      return { ...w, wins: { ...w.wins, [eventType]: [...cur] } }
    })
  const toggleTribeWin = (eventType: string, tribeName: string | null) => {
    const ids = active.filter((c) => c.tribe_name === tribeName).map((c) => c.id)
    setWatch((w) => {
      const cur = new Set(w.wins[eventType] ?? [])
      const allOn = ids.length > 0 && ids.every((id) => cur.has(id))
      ids.forEach((id) => (allOn ? cur.delete(id) : cur.add(id)))
      return { ...w, wins: { ...w.wins, [eventType]: [...cur] } }
    })
  }
  const hasWin = (eventType: string, id: string) => (watch.wins[eventType] ?? []).includes(id)
  const tribeAllWin = (eventType: string, tribeName: string | null) => {
    const ids = active.filter((c) => c.tribe_name === tribeName).map((c) => c.id)
    return ids.length > 0 && ids.every((id) => hasWin(eventType, id))
  }

  const toggleBoot = (id: string) =>
    setWatch((w) => ({ ...w, boots: w.boots.includes(id) ? w.boots.filter((b) => b !== id) : [...w.boots, id] }))

  const toggleVoter = (id: string) =>
    setOpenVoters((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const expandTribeVotes = (tribeName: string | null) => {
    const ids = active.filter((c) => c.tribe_name === tribeName).map((c) => c.id)
    setOpenVoters((s) => {
      const n = new Set(s)
      const allOpen = ids.every((id) => n.has(id))
      ids.forEach((id) => (allOpen ? n.delete(id) : n.add(id)))
      return n
    })
  }
  const setVote = (voter: string, target: string) => {
    setWatch((w) => ({ ...w, votes: { ...w.votes, [voter]: { target, confirmed: !predictMode } } }))
    setOpenVoters((s) => {
      const n = new Set(s)
      n.delete(voter)
      return n
    })
  }
  const toggleScope = (id: string) =>
    setVoterScope((m) => ({ ...m, [id]: m[id] === 'all' ? 'tribe' : 'all' }))
  const confirmPredicted = () => {
    setWatch((w) => ({
      ...w,
      votes: Object.fromEntries(Object.entries(w.votes).map(([k, v]) => [k, { ...v, confirmed: true }])),
    }))
    setPredictMode(false)
  }

  const tapEvent = (eventType: string, id: string, perUnit: boolean) =>
    setWatch((w) => {
      const byId = { ...(w.events[eventType] ?? {}) }
      const next = perUnit ? ((byId[id] ?? 0) + 1) % 10 : ((byId[id] ?? 0) + 1) % 2
      if (next) byId[id] = next
      else delete byId[id]
      return { ...w, events: { ...w.events, [eventType]: byId } }
    })

  const setFinale = (tier: 'finalFour' | 'finalThree' | 'winner', index: number, id: string | null) => {
    setWatch((w) => {
      const f = { ...w.finale, finalFour: [...w.finale.finalFour], finalThree: [...w.finale.finalThree] }
      if (tier === 'winner') f.winner = id
      else {
        const arr = f[tier]
        if (id == null) arr.splice(index, 1)
        else if (index < arr.length) arr[index] = id
        else arr.push(id)
      }
      return { ...w, finale: f }
    })
    setOpenSlot(null)
  }

  const wipe = () => {
    if (!confirm('Wipe everything recorded for this episode?')) return
    setWatch(emptyState())
    setOpenVoters(new Set())
    setVoterScope({})
    setOpenSlot(null)
    try {
      localStorage.removeItem(storageKey(episode.id))
    } catch {
      // ignore
    }
  }

  // ---- shared row bits ----
  const avatar = (c: CastMember, size: 'md' | 'lg' = 'md') => (
    <span className={c.eliminated_in_episode != null ? ELIMINATED_DIM : undefined}>
      <ContestantAvatar name={c.name} imageUrl={c.image_url} tribeColor={c.tribe_color} tribeName={c.tribe_name} size={size} />
    </span>
  )
  const nameText = (c: CastMember) => (
    <span className={`truncate font-display text-lg ${c.eliminated_in_episode != null ? ELIMINATED_STRIKE : ''}`}>{c.name}</span>
  )

  const peopleList = (
    rowFn: (c: CastMember) => ReactNode,
    header?: (tribeName: string | null, color: string | null) => ReactNode,
  ) => (
    <div className="mt-3 space-y-3">
      {groups.map((g) => (
        <div key={g.name ?? 'no-tribe'} className="overflow-hidden rounded-xl border border-cream-200 bg-white">
          <div className="flex items-center gap-2 bg-cream-50 px-3 py-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color ?? 'var(--color-stone-400)' }} />
            <span className="flex-1 font-display font-bold text-forest-900">{g.name ?? 'No tribe'}</span>
            {header?.(g.name, g.color)}
          </div>
          <ul>{g.people.map((c) => <li key={c.id} className="border-t border-cream-100 first:border-t-0">{rowFn(c)}</li>)}</ul>
        </div>
      ))}
    </div>
  )

  // ---- tabs ----
  const indImm = watch.wins[WIN_EVENTS.individualImmunity] ?? []
  const indRew = watch.wins[WIN_EVENTS.individualReward] ?? []

  const winsTab = (
    <>
      {indImm.length > 1 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-gold-400 bg-gold-100 px-3 py-2 text-sm text-forest-900">
          <span>{indImm.length} marked for individual immunity — only one person wins that. A tribe win?</span>
          <button
            type="button"
            onClick={() => makeTeamWin(WIN_EVENTS.individualImmunity, WIN_EVENTS.teamImmunity)}
            className="shrink-0 rounded-lg bg-forest-700 px-3 py-1 text-xs font-semibold text-white"
          >
            Make team immunity
          </button>
        </div>
      )}
      {indRew.length > 1 && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-gold-400 bg-gold-100 px-3 py-2 text-sm text-forest-900">
          <span>{indRew.length} marked for individual reward — a tribe win?</span>
          <button
            type="button"
            onClick={() => makeTeamWin(WIN_EVENTS.individualReward, WIN_EVENTS.teamReward)}
            className="shrink-0 rounded-lg bg-forest-700 px-3 py-1 text-xs font-semibold text-white"
          >
            Make team reward
          </button>
        </div>
      )}
      {peopleList(
        (c) => (
          <div className="flex min-h-14 items-center gap-3 px-3">
            {avatar(c)}
            {nameText(c)}
            <span className="ml-auto flex shrink-0 gap-2">
              <button
                type="button"
                aria-pressed={hasWin(WIN_EVENTS.individualImmunity, c.id)}
                onClick={() => toggleWin(WIN_EVENTS.individualImmunity, c.id)}
                className={`h-8 rounded-lg border px-3 text-xs font-bold ${
                  hasWin(WIN_EVENTS.individualImmunity, c.id) ? 'border-jade-600 bg-jade-600 text-white' : 'border-stone-200 bg-white text-stone-500'
                }`}
              >
                Imm
              </button>
              <button
                type="button"
                aria-pressed={hasWin(WIN_EVENTS.individualReward, c.id)}
                onClick={() => toggleWin(WIN_EVENTS.individualReward, c.id)}
                className={`h-8 rounded-lg border px-3 text-xs font-bold ${
                  hasWin(WIN_EVENTS.individualReward, c.id) ? 'border-gold-600 bg-gold-600 text-white' : 'border-stone-200 bg-white text-stone-500'
                }`}
              >
                Rew
              </button>
            </span>
          </div>
        ),
        (tribeName) => (
          <span className="flex gap-2">
            <button
              type="button"
              aria-pressed={tribeAllWin(WIN_EVENTS.teamImmunity, tribeName)}
              onClick={() => toggleTribeWin(WIN_EVENTS.teamImmunity, tribeName)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                tribeAllWin(WIN_EVENTS.teamImmunity, tribeName) ? 'border-jade-600 bg-jade-600 text-white' : 'border-stone-200 bg-white text-stone-700'
              }`}
            >
              Tribe imm
            </button>
            <button
              type="button"
              aria-pressed={tribeAllWin(WIN_EVENTS.teamReward, tribeName)}
              onClick={() => toggleTribeWin(WIN_EVENTS.teamReward, tribeName)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                tribeAllWin(WIN_EVENTS.teamReward, tribeName) ? 'border-gold-600 bg-gold-600 text-white' : 'border-stone-200 bg-white text-stone-700'
              }`}
            >
              Tribe rew
            </button>
          </span>
        ),
      )}
    </>
  )

  const suggestBootId = suggestedBoot(watch)
  const suggestBootName = suggestBootId ? cast.find((c) => c.id === suggestBootId)?.name ?? '—' : null

  const tribalTab = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-terracotta-700">The votes</p>
        <button
          type="button"
          onClick={() => setPredictMode((p) => !p)}
          className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
            predictMode ? 'border-forest-700 bg-forest-700 text-white' : 'border-stone-200 bg-white text-forest-700'
          }`}
        >
          {predictMode ? 'Done predicting' : 'Predict'}
        </button>
      </div>
      {suggestBootId && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-terracotta-400 bg-terracotta-50 px-3 py-2 text-sm text-forest-900">
          <span>No one's marked out — <b>{suggestBootName}</b> has the most votes.</span>
          <button
            type="button"
            onClick={() => toggleBoot(suggestBootId)}
            className="shrink-0 rounded-lg bg-terracotta-600 px-3 py-1 text-xs font-semibold text-white"
          >
            Mark out
          </button>
        </div>
      )}
      {Object.values(watch.votes).some((v) => !v.confirmed) && (
        <button
          type="button"
          onClick={confirmPredicted}
          className="mt-2 w-full rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white"
        >
          Lock in {Object.values(watch.votes).filter((v) => !v.confirmed).length} predicted votes
        </button>
      )}
      {peopleList(
        (c) => voteRow(c),
        (tribeName) => {
          const ids = active.filter((c) => c.tribe_name === tribeName).map((c) => c.id)
          const allOpen = ids.length > 0 && ids.every((id) => openVoters.has(id))
          return (
            <button
              type="button"
              onClick={() => expandTribeVotes(tribeName)}
              className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-forest-700"
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          )
        },
      )}

      <div className="mt-4 rounded-xl border border-cream-200 bg-white p-3">
        <h3 className="font-display text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Vote tally</h3>
        {voteTally(watch).length === 0 ? (
          <p className="mt-1 text-sm text-stone-400">No confirmed votes yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {voteTally(watch).map(({ target, count }) => {
              const boot = watch.boots.includes(target)
              return (
                <li key={target} className="flex items-center gap-2 font-display">
                  <span className="w-32 truncate font-semibold">
                    {cast.find((c) => c.id === target)?.name ?? target}
                    {boot && ' ←'}
                  </span>
                  <span className={`h-2.5 rounded ${boot ? 'bg-terracotta-600' : 'bg-stone-400'}`} style={{ width: `${18 + count * 26}px` }} />
                  <span className="ml-auto font-bold text-forest-700">{count}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer rounded-lg border border-cream-200 bg-cream-50 px-3 py-2 font-display text-sm font-semibold text-forest-900">
          Voted out
          {watch.boots.length > 0 && (
            <span className="font-normal text-terracotta-700"> · {watch.boots.map((id) => cast.find((c) => c.id === id)?.name ?? id).join(', ')}</span>
          )}
        </summary>
        {peopleList((c) => {
          const out = watch.boots.includes(c.id)
          return (
            <button
              type="button"
              onClick={() => toggleBoot(c.id)}
              aria-pressed={out}
              className={`flex min-h-14 w-full items-center gap-3 px-3 text-left ${out ? 'bg-terracotta-50' : 'hover:bg-cream-50'}`}
            >
              {avatar(c)}
              {nameText(c)}
              {out && <span className="ml-auto rounded-md bg-terracotta-100 px-2 py-1 text-[10px] font-bold uppercase text-terracotta-700">Out</span>}
            </button>
          )
        })}
      </details>
    </>
  )

  function voteRow(c: CastMember) {
    const v = watch.votes[c.id]
    const open = openVoters.has(c.id)
    const showAll = voterScope[c.id] === 'all'
    const candidates = showAll ? active : active.filter((o) => o.tribe_name === c.tribe_name)
    return (
      <div>
        <button
          type="button"
          onClick={() => toggleVoter(c.id)}
          className="flex min-h-14 w-full items-center gap-3 px-3 text-left hover:bg-cream-50"
        >
          {avatar(c)}
          {nameText(c)}
          <span className={`ml-auto shrink-0 font-display text-sm font-semibold ${v && !v.confirmed ? 'italic text-stone-400' : 'text-stone-500'}`}>
            {v ? (
              <>→ <b className="text-forest-700">{cast.find((x) => x.id === v.target)?.name ?? v.target}</b>{!v.confirmed && ' (guess)'}</>
            ) : (
              '→'
            )}
          </span>
        </button>
        {open && (
          <div className="border-t border-dashed border-stone-300 bg-cream-50 p-2">
            <div className="flex flex-wrap gap-2">
              {candidates.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={o.id === c.id}
                  onClick={() => setVote(c.id, o.id)}
                  style={{ borderColor: o.tribe_color ?? 'var(--color-stone-200)' }}
                  className="rounded-lg border-2 bg-white px-3 py-1.5 font-display text-sm font-semibold text-forest-700 disabled:opacity-40"
                >
                  {o.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => toggleScope(c.id)}
              className="mt-2 rounded-lg border border-stone-200 bg-white px-3 py-1 text-xs font-semibold text-forest-700"
            >
              {showAll ? 'Show tribe only' : 'Show entire cast'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const chipTab = (t: TabKey) => {
    const events = chipEventsForTab(rules?.scoring_events ?? [], t)
    if (events.length === 0) return <p className="mt-4 text-sm text-stone-500">No events for this tab in this season.</p>
    const sel = chipSel[t] ?? events[0].event_type
    const cur = events.find((e) => e.event_type === sel) ?? events[0]
    const ptsOf = (e: typeof cur) => (postMerge && e.postmerge_point_value != null ? e.postmerge_point_value : e.point_value)
    const pts = ptsOf(cur)
    return (
      <>
        <div className="flex flex-wrap gap-2">
          {events.map((e) => (
            <button
              key={e.event_type}
              type="button"
              aria-pressed={e.event_type === cur.event_type}
              onClick={() => setChipSel((m) => ({ ...m, [t]: e.event_type }))}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                e.event_type === cur.event_type ? 'border-terracotta-600 bg-terracotta-600 text-white' : 'border-forest-200 bg-white text-forest-700'
              }`}
            >
              {shortLabel(e.event_type, e.label)}
              <span className="ml-1 font-normal opacity-70">
                {ptsOf(e) >= 0 ? '+' : ''}
                {ptsOf(e)}
              </span>
            </button>
          ))}
        </div>
        {peopleList((c) => {
          const n = (watch.events[cur.event_type] ?? {})[c.id] ?? 0
          return (
            <button
              type="button"
              onClick={() => tapEvent(cur.event_type, c.id, cur.is_per_unit)}
              aria-pressed={n > 0}
              className={`flex min-h-14 w-full items-center gap-3 px-3 text-left ${n > 0 ? 'bg-jade-50' : 'hover:bg-cream-50'}`}
            >
              {avatar(c)}
              {nameText(c)}
              {n > 0 && (
                <span className="ml-auto rounded-full bg-jade-600 px-3 py-1 text-sm font-semibold text-white">
                  {cur.is_per_unit ? `x${n}` : '✓'}
                </span>
              )}
            </button>
          )
        })}
        <p className="mt-2 text-xs text-stone-400">Worth {pts >= 0 ? '+' : ''}{pts} {cur.is_per_unit ? 'each' : ''} this episode.</p>
      </>
    )
  }

  const finaleTab = (
    <>
      {chipTab('final')}
      <div className="mt-6">
        <p className="text-center font-display text-xs font-bold uppercase tracking-[0.16em] text-gold-800">The finale</p>
        {finaleTier('winner', watch.finale.winner ? [watch.finale.winner] : [], 1, 'Sole Survivor', true)}
        {finaleTier('finalThree', watch.finale.finalThree, 3, 'Final 3')}
        {finaleTier('finalFour', watch.finale.finalFour, 4, 'Final 4')}
        {openSlot && (
          <div className="mt-3 rounded-xl border border-dashed border-stone-300 bg-cream-50 p-2">
            <div className="flex flex-wrap gap-2">
              {active.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFinale(openSlot.tier, openSlot.index, c.id)}
                  style={{ borderColor: c.tribe_color ?? 'var(--color-stone-200)' }}
                  className="rounded-lg border-2 bg-white px-3 py-1.5 font-display text-sm font-semibold text-forest-700"
                >
                  {c.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setFinale(openSlot.tier, openSlot.index, null)}
                className="rounded-lg border-2 border-stone-300 bg-white px-3 py-1.5 font-display text-sm font-semibold text-stone-500"
              >
                Clear slot
              </button>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-stone-400">
          Records the finish; set the exact placements (and 2nd vs. 3rd) on the contestants — the finale scoring follows.
        </p>
      </div>
    </>
  )

  function finaleTier(
    tier: 'finalFour' | 'finalThree' | 'winner',
    ids: string[],
    max: number,
    label: string,
    apex = false,
  ) {
    const slots: ReactNode[] = ids.map((id, i) => {
      const c = cast.find((x) => x.id === id)
      return (
        <button
          key={`${tier}-${i}`}
          type="button"
          onClick={() => setOpenSlot({ tier, index: i })}
          style={{ borderColor: c?.tribe_color ?? 'var(--color-stone-300)' }}
          className={`flex flex-col items-center gap-1 rounded-xl border-2 p-2 ${apex ? 'w-36 bg-gold-100' : 'w-24'}`}
        >
          {c && <ContestantAvatar name={c.name} imageUrl={c.image_url} tribeColor={c.tribe_color} tribeName={c.tribe_name} size={apex ? 'lg' : 'md'} />}
          <span className="max-w-full truncate font-display text-sm font-semibold">{c?.name ?? '—'}</span>
        </button>
      )
    })
    if (ids.length < max)
      slots.push(
        <button
          key={`${tier}-add`}
          type="button"
          onClick={() => setOpenSlot({ tier, index: ids.length })}
          className={`flex items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-white ${apex ? 'h-[72px] w-36' : 'h-[64px] w-24'} text-2xl text-stone-400`}
        >
          +
        </button>,
      )
    return (
      <div className="mt-3 flex flex-col items-center gap-1.5">
        <span className={`font-display text-[10px] font-bold uppercase tracking-[0.16em] ${apex ? 'text-gold-800' : 'text-stone-500'}`}>{label}</span>
        <div className="flex flex-wrap justify-center gap-2">{slots}</div>
      </div>
    )
  }

  const notesTab = (
    <>
      <textarea
        value={watch.notes}
        onChange={(e) => setWatch((w) => ({ ...w, notes: e.target.value }))}
        rows={8}
        aria-label="Notes"
        placeholder="Anything to check, judgment calls, reminders…"
        className="w-full rounded-xl border border-cream-200 bg-white px-3 py-2 text-sm"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={wipe} className="min-h-11 rounded-lg border border-stone-200 px-4 text-sm font-semibold text-forest-700">
          Wipe for next episode
        </button>
        <span className="text-sm text-stone-500">
          {synced === 'saving'
            ? 'Saving…'
            : synced === 'saved'
              ? 'Saved to your league ✓'
              : synced === 'error'
                ? 'Offline — saved on this device, will sync when you reconnect'
                : ''}
        </span>
      </div>
      <p className="mt-6 text-sm text-stone-500">
        This saves to your league, so it's here on any device — I read it during the scoring ritual. Nothing to copy over.
      </p>
    </>
  )

  return (
    <div>
      <Link
        to="/"
        aria-label="Back to My Season"
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-terracotta-700 hover:underline"
      >
        <span aria-hidden>‹</span> My Season
      </Link>
      <PageHeader
        eyebrow={`Episode ${episode.episode_number}`}
        title="Watch tracker"
        description={`${recorded} recorded${synced === 'error' ? ' · offline, saved on device' : synced === 'saving' ? ' · saving…' : synced === 'saved' ? ' · saved to your league' : ''}`}
      />

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={t.key === tab}
            onClick={() => setTab(t.key)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 font-display text-sm font-semibold ${
              t.key === tab ? 'border-terracotta-600 bg-terracotta-600 text-white' : 'border-cream-300 bg-white text-forest-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'wins' && winsTab}
        {tab === 'tribal' && tribalTab}
        {tab === 'extras' && chipTab('extras')}
        {tab === 'camp' && chipTab('camp')}
        {tab === 'final' && finaleTab}
        {tab === 'notes' && notesTab}
      </div>
    </div>
  )
}
