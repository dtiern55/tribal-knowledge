import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { ColdStart } from '../components/ColdStart'
import { ContestantAvatar, ELIMINATED_DIM, ELIMINATED_STRIKE } from '../components/ContestantAvatar'
import { CorrectVote } from '../components/CorrectVote'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { Torch, TorchDefs } from '../components/Torch'
import { ChevronRightIcon } from '../components/icons'
import { api, getActiveSeason } from '../lib/api'
import { displayName } from '../lib/cast'
import { episodeClosed } from '../lib/episodes'
import { rankStandings } from '../lib/standings'
import type {
  AdvantagePlay,
  Contestant,
  Elimination,
  EliminationPick,
  Episode,
  RosterPick,
  Season,
  StandingEntry,
} from '../types'

// A movement triangle + count: ▲ jade for a climb, ▼ terracotta for a slip.
function Movement({ up, delta }: { up: boolean; delta: number }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-bold leading-none ${up ? 'text-jade-700' : 'text-terracotta-600'}`}
      aria-label={`${up ? 'Up' : 'Down'} ${delta} since last episode`}
    >
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      <span className="tabular-nums">{delta}</span>
    </span>
  )
}

// Rank with position movement placed *spatially*: the triangle sits above the
// number for a climb and below for a slip, so direction reads at a glance. The
// number is the only thing in normal flow and the triangles float absolutely
// above/below it, so the rank number never shifts and the column stays a clean
// aligned line row to row regardless of who moved.
function Rank({ rank, tied, entry }: { rank: number; tied: boolean; entry: StandingEntry }) {
  const up = entry.trend === 'up'
  const down = entry.trend === 'down'
  return (
    <span className="relative inline-flex flex-col items-center leading-none">
      {up && (
        <span className="absolute bottom-full mb-1">
          <Movement up delta={entry.trend_delta} />
        </span>
      )}
      <span
        className={`font-display text-xl font-bold leading-none tabular-nums ${rank === 1 ? 'text-gold-600' : 'text-stone-500'}`}
        aria-label={`${tied ? 'Tied at ' : ''}rank ${rank}`}
      >
        {rank}
      </span>
      {down && (
        <span className="absolute top-full mt-1">
          <Movement up={false} delta={entry.trend_delta} />
        </span>
      )}
    </span>
  )
}

// The self "hero", sibling of the This Week command hero on My Season: same
// forest card and gold points block, but it answers the standings question —
// where you sit, how far you moved this week, and your total. Resting green
// (no data-owed): standings never "owe" you anything.
function StandingHero({ entry, rank, tied, count }: { entry: StandingEntry; rank: number; tied: boolean; count: number }) {
  const up = entry.trend === 'up'
  const down = entry.trend === 'down'
  const lep = entry.last_episode_points
  return (
    <div className="week-hero relative mb-5 rounded-2xl px-4 pt-3.5 pb-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <div className="font-display text-xs font-bold uppercase tracking-[0.18em] text-gold-300">Your standing</div>
          <p className="mt-0.5 font-display text-3xl font-bold leading-none tracking-wide text-cream-50">
            {tied ? `Tied #${rank}` : `#${rank}`}
            <span className="ml-2 font-sans text-sm font-normal tracking-normal text-cream-100/60">of {count}</span>
          </p>
          {(up || down) && (
            <span
              className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                up ? 'bg-jade-600/30 text-jade-100' : 'bg-terracotta-600/25 text-terracotta-200'
              }`}
            >
              <span aria-hidden>{up ? '▲' : '▼'}</span>
              {entry.trend_delta} {entry.trend_delta === 1 ? 'place' : 'places'} this week
            </span>
          )}
        </div>
        <div className="ml-auto shrink-0 text-right">
          <span className="block text-[9px] uppercase tracking-[0.12em] text-cream-100/55">My pts</span>
          <span className="block font-display text-3xl font-bold leading-none tabular-nums text-gold-300">{entry.total_points}</span>
          {lep !== 0 && (
            <span className={`mt-1 block text-[11px] font-semibold tabular-nums ${lep > 0 ? 'text-jade-100' : 'text-terracotta-200'}`}>
              {lep > 0 ? '+' : ''}{lep} last ep
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// One torch per castaway on the roster: lit while they're in the game, a
// smoke curl over a cooling ember for the episode after they go home, then
// gone unless the player swapped someone in. Torches shrink as the season
// goes on, so the list visibly thins out. Replaces the portrait cluster, which
// made every row busy; the faces are one tap away on the Team page. Nothing
// renders while rosters are hidden (both lists empty).
function Torches({ entry }: { entry: StandingEntry }) {
  const lit = entry.active_survivors
  const out = entry.recently_eliminated_survivors
  if (lit.length === 0 && out.length === 0) return null
  const label = out.length === 0 ? `${lit.length} still in` : `${lit.length} still in, lost ${out.map((s) => s.name).join(' and ')} this week`
  // The Sole Survivor leads the row as the red champion flame — lit while their
  // pick is in, snuffed (mirrored) the week it goes out, then off with the rest
  // once it's long gone (#164). Everyone else is a gold votive.
  const ssId = entry.sole_survivor_contestant_id
  const champLit = ssId ? lit.find((s) => s.contestant_id === ssId) : undefined
  const champOut = ssId ? out.find((s) => s.contestant_id === ssId) : undefined
  return (
    <span className="flex flex-none gap-0.5" role="img" aria-label={label}>
      {champLit && (
        <span className="ss-champion">
          <Torch champion lit title={`${champLit.name}, your Sole Survivor`} />
        </span>
      )}
      {champOut && (
        <span className="ss-champion is-snuffed">
          <Torch champion lit={false} title={`${champOut.name}, your Sole Survivor, eliminated ep ${champOut.eliminated_episode}`} />
        </span>
      )}
      {lit
        .filter((s) => s.contestant_id !== ssId)
        .map((s) => (
          <Torch key={s.contestant_id} lit title={s.name} />
        ))}
      {out
        .filter((s) => s.contestant_id !== ssId)
        .map((s) => (
          <Torch key={s.contestant_id} lit={false} title={`${s.name}, eliminated ep ${s.eliminated_episode}`} />
        ))}
    </span>
  )
}

// The doubled mark: a played advantage paid this line twice. Text, not the
// season idol — the idol competes with the avatars and the score beside it.
function Times2({ title }: { title: string }) {
  return (
    <span
      className="shrink-0 rounded bg-gold-100 px-1 text-[10px] font-bold tabular-nums text-gold-700"
      title={title}
      aria-label={title}
    >
      ×2
    </span>
  )
}

/** One player's season, as the standings row expands it: roster, ballot and
 *  advantage plays, each keyed by episode. Every piece is already served
 *  per-player and gated for other players — nothing new lands here (#806). */
interface PlayerHistory {
  roster: RosterPick[]
  /** Locked episodes' ballots, keyed by episode id. */
  ballots: Record<string, EliminationPick[]>
  plays: AdvantagePlay[]
  /** Their roster is still private (before tribes lock). */
  hidden: boolean
}

// The expanded row: that player's latest week — the tribe they carried into
// it, what each castaway scored, and who they voted for. An advantage gets no
// line of its own; it marks the thing it doubled with a ×2. Earlier weeks are
// the Team page's job, one tap away at the bottom. What the week paid the
// player is the number the collapsed row already shows a few pixels above.
function HistoryPanel({
  id,
  episode,
  history,
  byId,
  bootIds,
  scores,
  teamHref,
  name,
}: {
  id: string
  /** The most recent locked, non-finale episode. */
  episode: Episode | undefined
  history: PlayerHistory | null
  byId: Map<string, Contestant>
  /** Who actually went home that episode — marks a vote right. */
  bootIds: Set<string>
  /** What each castaway scored that episode, before this player's doubling. */
  scores: Map<string, number>
  teamHref: string
  name: string
}) {
  const nameOf = (id: string) => {
    const c = byId.get(id)
    return c ? displayName(c) : '—'
  }
  const label = 'pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-paper-ink-faded'
  const note = 'py-1.5 text-sm text-paper-ink-faded'
  const n = episode?.episode_number ?? 0
  // The tribe as it stood that week, and — like the torches in the row above —
  // a castaway snuffed in an EARLIER episode is simply gone, even if their
  // player never swapped them out. Only this week's loss still shows, struck.
  // `eliminated_in_episode` is the server's own "out for good", so a Redemption
  // Island duel loss isn't one.
  const team = (history?.roster ?? []).filter((pick) => {
    const out = byId.get(pick.contestant_id)?.eliminated_in_episode
    return (
      pick.active_from_episode <= n &&
      (pick.active_until_episode == null || pick.active_until_episode >= n) &&
      (out == null || out >= n)
    )
  })
  // Ballot order is the ballot ladder: the Power Vote's name first (no rung),
  // then most to least confident, exactly as the API returns it (#694).
  const votes = (episode && history?.ballots[episode.id]) ?? []
  const plays = (history?.plays ?? []).filter((play) => play.episode_id === episode?.id)
  const doubled = plays.find((play) => play.advantage_type === 'double_roster_points')?.target_contestant_id
  const powerVote = plays.find((play) => play.advantage_type === 'double_vote_points')
  // A #303-era Power Vote named no target and doubled the whole ballot, so its
  // idol sits by the episode instead of on one vote (matches the Team page).
  const wholeBallotDoubled = powerVote != null && powerVote.target_contestant_id == null

  return (
    <div id={id} className="border-t border-paper-line bg-black/[.02] px-4 py-2">
      {history == null ? (
        <p className={note}>Loading…</p>
      ) : history.hidden ? (
        <p className={note}>Their tribe and weekly play unlock when tribes lock.</p>
      ) : episode == null ? (
        <p className={note}>No episodes have locked yet.</p>
      ) : (
        <>
          <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-forest-800">
            Ep {n}
            {wholeBallotDoubled && <Times2 title="Power Vote this episode" />}
          </span>
          <dl className="mt-1 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2">
            <dt className={label}>Team</dt>
            <dd className="flex flex-col gap-1 py-0.5">
              {team.length === 0 ? (
                <span className="text-sm text-paper-ink-faded">—</span>
              ) : (
                team.map((pick) => {
                  const c = byId.get(pick.contestant_id)
                  // Snuffed THIS episode — struck for this one week only, the
                  // same life as the snuffed torch in the row above (#457).
                  // Anyone snuffed earlier is already filtered out of `team`.
                  const lost = c?.eliminated_in_episode === n
                  // The score is what this castaway actually paid their
                  // player, doubling included: live scoring doubles the
                  // episode's event points for the castaway a Double Castaway
                  // Points named, so the panel does the same (the ×2 beside it
                  // says why the number is big).
                  const isDoubled = pick.contestant_id === doubled
                  const scored = (scores.get(pick.contestant_id) ?? 0) * (isDoubled ? 2 : 1)
                  return (
                    <span key={pick.id} className="flex w-full items-center gap-1.5 text-sm">
                      <span className={lost ? ELIMINATED_DIM : undefined}>
                        <ContestantAvatar name={nameOf(pick.contestant_id)} imageUrl={c?.image_url ?? null} size="sm" tribeColor={c?.tribe_color ?? null} tribeName={c?.tribe_name ?? null} />
                      </span>
                      <span
                        className={`truncate ${lost ? ELIMINATED_STRIKE : ''} ${
                          pick.is_sole_survivor ? 'font-semibold text-gold-700' : 'text-paper-ink'
                        }`}
                        title={pick.is_sole_survivor ? 'Their Sole Survivor' : undefined}
                      >
                        {nameOf(pick.contestant_id)}
                      </span>
                      {isDoubled && <Times2 title="Double Castaway Points on them this episode" />}
                      <span
                        className={`ml-auto shrink-0 font-medium tabular-nums ${
                          scored > 0 ? 'text-jade-700' : scored < 0 ? 'text-terracotta-600' : 'text-paper-ink-faded'
                        }`}
                      >
                        {scored > 0 ? '+' : ''}{scored}
                      </span>
                    </span>
                  )
                })
              )}
            </dd>

            <dt className={label}>Voted</dt>
            <dd className="flex flex-wrap items-center gap-1.5 py-0.5">
              {votes.length === 0 ? (
                <span className="text-sm text-paper-ink-faded">No votes</span>
              ) : (
                votes.map((vote) => {
                  const idol =
                    vote.contestant_id === powerVote?.target_contestant_id ? (
                      <Times2 title="Power Vote on this vote" />
                    ) : null
                  return bootIds.has(vote.contestant_id) ? (
                    <CorrectVote key={vote.id} name={nameOf(vote.contestant_id)} icon={idol} />
                  ) : (
                    <span key={vote.id} className="inline-flex items-center gap-1 rounded-md border border-paper-line bg-black/[.03] px-2 py-0.5 text-sm text-paper-ink-faded">
                      {idol}
                      {nameOf(vote.contestant_id)}
                    </span>
                  )
                })
              )}
            </dd>

          </dl>
        </>
      )}
      <Link
        to={teamHref}
        className="my-2 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-forest-700 underline underline-offset-2"
      >
        {name}'s full team page
        <ChevronRightIcon className="size-[14px]" />
      </Link>
    </div>
  )
}

const EMPTY_IDS: Set<string> = new Set()
const EMPTY_CAST: Map<string, Contestant> = new Map()
const EMPTY_SCORES: Map<string, number> = new Map()

export function StandingsPage() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [entries, setEntries] = useState<StandingEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // One row open at a time. Nothing below is fetched until a row is first
  // opened — nobody expands one on most visits, so the standings don't pay for
  // it — and both caches are kept for the rest of the visit (#806).
  const [openId, setOpenId] = useState<string | null>(null)
  // The week every row expands into, fetched once and shared: which episode it
  // is, the cast, who went home in it, and what each castaway scored.
  const [ctx, setCtx] = useState<{
    week: Episode | undefined
    byId: Map<string, Contestant>
    bootIds: Set<string>
    scores: Map<string, number>
  } | null>(null)
  const [histories, setHistories] = useState<Map<string, PlayerHistory>>(new Map())

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const [ss, current] = await Promise.all([
          api.get<Season[]>('/league-seasons'),
          getActiveSeason(),
        ])
        if (!live) return
        setSeasons(ss)
        const activeId = current?.id ?? ''
        setSelectedId(activeId)
        if (activeId) {
          const standings = await api.get<StandingEntry[]>(`/league-seasons/${activeId}/standings`)
          if (live) setEntries(standings)
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Failed to load standings')
      } finally {
        if (live) setLoading(false)
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [])

  const season = seasons.find((s) => s.id === selectedId)
  const showSeasonId = season?.season_id
  const rosterLockEpisode = season?.roster_lock_episode

  useEffect(() => {
    if (!openId || ctx || !showSeasonId) return
    let live = true
    async function load() {
      const [episodes, cast, eliminations] = await Promise.all([
        api.get<Episode[]>(`/seasons/${showSeasonId}/episodes`),
        api.get<Contestant[]>(`/seasons/${showSeasonId}/contestants`),
        api.get<Elimination[]>(`/seasons/${showSeasonId}/eliminations`).catch(() => []),
      ])
      // The week a panel shows: the latest locked episode from the roster lock
      // on. The finale is left out — its ballot is a bracket, not votes, and it
      // reads as the pyramid on the Team page (#82/#86, as on that page).
      const week = episodes
        .filter(
          (e) => episodeClosed(e) && !e.is_finale && e.episode_number >= (rosterLockEpisode ?? 1),
        )
        .sort((a, b) => b.episode_number - a.episode_number)[0]
      const scores = week
        ? await api
            .get<{ contestant_id: string; points: number }[]>(
              `/seasons/${showSeasonId}/episodes/${week.id}/contestant-points`,
            )
            .catch(() => [])
        : []
      if (live) {
        setCtx({
          week,
          byId: new Map(cast.map((c) => [c.id, c])),
          bootIds: new Set(
            eliminations.filter((row) => row.episode_id === week?.id).map((row) => row.contestant_id),
          ),
          scores: new Map(scores.map((row) => [row.contestant_id, row.points])),
        })
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [openId, ctx, showSeasonId, rosterLockEpisode])

  useEffect(() => {
    if (!openId || !selectedId || histories.has(openId)) return
    let live = true
    async function load() {
      // Another player's roster is 403 until tribes lock, and their plays and
      // ballots only cover locked episodes — the same three calls their Team
      // page makes, so this panel shows exactly what that page would.
      const [roster, ballots, plays] = await Promise.all([
        api.get<RosterPick[]>(`/league-seasons/${selectedId}/roster/${openId}`).then(
          (rows) => ({ rows, hidden: false }),
          () => ({ rows: [] as RosterPick[], hidden: true }),
        ),
        api
          .get<Record<string, EliminationPick[]>>(`/league-seasons/${selectedId}/picks/${openId}`)
          .catch(() => ({}) as Record<string, EliminationPick[]>),
        api.get<AdvantagePlay[]>(`/league-seasons/${selectedId}/advantage-plays/${openId}`).catch(() => []),
      ])
      if (!live) return
      setHistories((prev) =>
        new Map(prev).set(openId!, {
          roster: roster.rows,
          ballots,
          plays,
          hidden: roster.hidden,
        }),
      )
    }
    void load()
    return () => {
      live = false
    }
  }, [openId, selectedId, histories])

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load standings">{error}</Notice>
  if (!season) return <ColdStart />

  const ranked = rankStandings(entries)
  const mine = ranked.find(({ entry }) => entry.user_id === userId)
  const hasScoring = entries.some((e) => e.total_points !== 0)


  return (
    <div>
      <PageHeader
        eyebrow={season.status === 'completed' ? 'Season complete' : undefined}
        title="Standings"
        meta={season.name}
      />

      {mine && (
        <Link
          to={`/league-seasons/${season.id}/team/${mine.entry.user_id}`}
          className="block transition-transform hover:-translate-y-0.5"
          aria-label={`Your team — rank ${mine.rank} of ${ranked.length}`}
        >
          <StandingHero entry={mine.entry} rank={mine.rank} tied={mine.tied} count={ranked.length} />
        </Link>
      )}

      {ranked.length === 0 ? (
        <Notice title="No players yet">The standings will appear after players join this season.</Notice>
      ) : (
        <section
          aria-label="League standings"
          className="overflow-hidden rounded-2xl border border-paper-edge record-paper shadow-[0_8px_24px_-12px_rgb(10_22_19_/_0.35)]"
        >
          <TorchDefs />
          <div className="flex items-center justify-between border-b border-paper-line px-4 py-2.5">
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.13em] text-forest-700">League</span>
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-paper-ink-faded">
              {ranked.length} players
            </span>
          </div>
          <ol>
            {ranked.map(({ entry, rank, tied }) => {
              const isMe = entry.user_id === userId
              const isOpen = openId === entry.user_id
              return (
                <li key={entry.user_id} className="border-b border-paper-line last:border-b-0">
                  {/* The row opens its own history in place; the Team page is a
                      link inside the panel, so the row stays one tap target
                      instead of a link nested in a button (#806). */}
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : entry.user_id)}
                    aria-expanded={isOpen}
                    aria-controls={`history-${entry.user_id}`}
                    aria-current={isMe ? 'true' : undefined}
                    className={`group relative grid w-full grid-cols-[2.25rem_minmax(0,1fr)_6rem_3.25rem] items-center gap-3 px-4 py-2.5 text-left transition-colors md:grid-cols-[3rem_minmax(0,1fr)_6rem_3.75rem] ${
                      isMe ? 'bg-forest-600/[.06]' : 'hover:bg-forest-600/[.04]'
                    }`}
                  >
                    {isMe && <span className="absolute inset-y-0 left-0 w-[3px] bg-gold-500" aria-hidden />}
                    <Rank rank={rank} tied={tied} entry={entry} />
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-display text-[17px] font-semibold text-paper-ink group-hover:text-forest-700">
                        {entry.display_name}
                      </span>
                      {isMe && (
                        <span className="flex-none rounded bg-jade-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">You</span>
                      )}
                      {/* Disclosure caret beside the name rather than a column
                          of its own: the row's four columns are already tight
                          on a phone. */}
                      <ChevronRightIcon
                        className={`size-[14px] flex-none text-paper-ink-faded transition-transform ${isOpen ? 'rotate-90' : ''}`}
                      />
                    </div>
                    {/* Torches sit in a fixed-width column just left of the
                        score and left-align inside it, so their left edges line
                        up row to row as rows thin out. Five 16px flames with 2px
                        gaps sit inside the 6rem with room to spare, so the Sole
                        Survivor's spotlight can spill into the gaps around the
                        flames rather than be clipped (#164). */}
                    <div className="flex min-w-0 justify-start">
                      <Torches entry={entry} />
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-bold leading-tight text-forest-800 tabular-nums">{entry.total_points}</p>
                      {entry.last_episode_points !== 0 ? (
                        <p className={`text-[11px] font-medium tabular-nums ${entry.last_episode_points > 0 ? 'text-jade-700' : 'text-terracotta-600'}`}>
                          {entry.last_episode_points > 0 ? '+' : ''}{entry.last_episode_points}
                        </p>
                      ) : (
                        <p className="text-[11px] text-paper-ink-faded">{hasScoring ? 'even' : '—'}</p>
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <HistoryPanel
                      id={`history-${entry.user_id}`}
                      episode={ctx?.week}
                      history={ctx ? (histories.get(entry.user_id) ?? null) : null}
                      byId={ctx?.byId ?? EMPTY_CAST}
                      bootIds={ctx?.bootIds ?? EMPTY_IDS}
                      scores={ctx?.scores ?? EMPTY_SCORES}
                      name={entry.display_name}
                      teamHref={`/league-seasons/${season.id}/team/${entry.user_id}`}
                    />
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </div>
  )
}
