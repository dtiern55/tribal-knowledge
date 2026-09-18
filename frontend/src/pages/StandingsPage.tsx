import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { ColdStart } from '../components/ColdStart'
import { ContestantAvatar, ELIMINATED_DIM, ELIMINATED_STRIKE } from '../components/ContestantAvatar'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { Torch, TorchDefs } from '../components/Torch'
import { ChevronRightIcon } from '../components/icons'
import { ADV_LABELS } from '../lib/advantages'
import { episodeClosed } from '../lib/episodes'
import { pathQuery, useActiveSeason } from '../lib/queries'
import { rankStandings } from '../lib/standings'
import type { Episode, HubEntry, StandingEntry } from '../types'

// How far they moved: a small solid triangle, then the count, both in the
// movement colour — jade for a climb, terracotta for a slip. The count sits
// beside the shape rather than inside it (#808), which is what scoreboards
// do and why: a triangle's usable width changes with its height, so a number
// in there has to be sized for "10" and parked where "10" fits. Out here it
// can just be legible.
function Movement({ up, delta }: { up: boolean; delta: number }) {
  return (
    <span
      className={`inline-flex items-center gap-[2px] font-display text-[12px] font-bold leading-none tabular-nums ${
        up ? 'text-jade-700' : 'text-terracotta-700'
      }`}
      aria-label={`${up ? 'Up' : 'Down'} ${delta} since last episode`}
    >
      <span className="text-[9px] leading-none" aria-hidden>
        {up ? '▲' : '▼'}
      </span>
      {delta}
    </span>
  )
}

// Rank with position movement placed *spatially*: the arrow points the way
// they moved, left of the number it moved (#808). Its slot is held even on a
// row that didn't move, so the rank numbers stay one aligned column.
function Rank({ rank, tied, entry }: { rank: number; tied: boolean; entry: StandingEntry }) {
  const up = entry.trend === 'up'
  const down = entry.trend === 'down'
  return (
    <span className="flex items-center gap-1 leading-none">
      {/* Wide enough for the widest pair ("▼12"), held empty on a row that
          didn't move so every rank number starts at the same x. */}
      <span className="flex w-[26px] flex-none items-center">
        {(up || down) && <Movement up={up} delta={entry.trend_delta} />}
      </span>
      <span
        className={`font-display text-xl font-bold leading-none tabular-nums ${rank === 1 ? 'text-gold-600' : 'text-stone-500'}`}
        aria-label={`${tied ? 'Tied at ' : ''}rank ${rank}`}
      >
        {rank}
      </span>
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

// Where a played advantage landed: a gold chip on the line it changed. Text,
// not the season idol — the idol competes with the avatars and the score
// beside them. Double Castaway Points really is a doubling, so it reads ×2;
// the Power Vote is its own rung on the ballot ladder (#746), not a multiplier,
// so it reads by name.
function PlayMark({ text, title }: { text: string; title: string }) {
  return (
    <span
      className="shrink-0 rounded bg-gold-100 px-1 text-[10px] font-bold tabular-nums text-gold-700"
      title={title}
      aria-label={title}
    >
      {text}
    </span>
  )
}

// The play's own name, from the shared label map, so a rename reaches here too.
const POWER_VOTE = ADV_LABELS.double_vote_points

// The expanded row: that player's latest week — the tribe they carried into
// it, what each castaway scored, and who they voted for. An advantage gets no
// line of its own; it marks the thing it doubled with a ×2. Earlier weeks are
// the Team page's job, one tap away at the bottom. What the week paid the
// player is the number the collapsed row already shows a few pixels above.
//
// Everything comes from the league Hub for that episode (#812), which the page
// fetches once in the background for every player — so opening a row is a
// render, not a request.
function HistoryPanel({
  id,
  episode,
  entry,
  waiting,
  teamHref,
  name,
}: {
  id: string
  /** The most recent locked, non-finale episode. */
  episode: Episode | undefined
  /** That player's week. Undefined once the Hub is in and they simply had no
   *  roster, ballot or play that episode. */
  entry: HubEntry | undefined
  /** The Hub hasn't landed yet — the panel is a moment early. */
  waiting: boolean
  teamHref: string
  name: string
}) {
  const label = 'pt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-paper-ink-faded'
  const note = 'py-1.5 text-sm text-paper-ink-faded'
  const tribe = entry?.roster ?? []
  const votes = entry?.ballot ?? []
  // Which line an advantage changed. A #303-era Power Vote named no target and
  // paid on the whole ballot, so its mark sits by the episode instead.
  const doubled =
    entry?.advantage_type === 'double_roster_points' ? entry.advantage_target?.contestant_id : undefined
  const powerVote =
    entry?.advantage_type === 'double_vote_points' ? (entry.advantage_target?.contestant_id ?? null) : undefined
  const wholeBallotDoubled = powerVote === null

  return (
    <div id={id} className="border-t border-paper-line bg-black/[.02] px-4 py-2">
      {waiting ? (
        <p className={note}>Loading…</p>
      ) : episode == null ? (
        <p className={note}>No episodes have locked yet.</p>
      ) : entry == null ? (
        <p className={note}>No tribe or ballot for this episode.</p>
      ) : (
        <>
          <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-forest-800">
            Ep {episode.episode_number}
            {wholeBallotDoubled && <PlayMark text={POWER_VOTE} title={`${POWER_VOTE} on this whole ballot`} />}
          </span>
          <dl className="mt-1 grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2">
            <dt className={label}>Tribe</dt>
            <dd className="flex flex-col gap-1 py-0.5">
              {tribe.length === 0 ? (
                <span className="text-sm text-paper-ink-faded">—</span>
              ) : (
                tribe.map((member) => {
                  // Snuffed THIS episode — struck for this one week only, the
                  // same life as the snuffed torch in the row above (#457).
                  // Anyone snuffed earlier is already out of the Hub's roster.
                  const lost = member.eliminated_episode != null
                  const isSoleSurvivor = member.contestant_id === entry.sole_survivor_contestant_id
                  // The Hub reports base points and names who was doubled, so
                  // the doubling is applied once, here, the way live scoring
                  // doubles that castaway's events for the week.
                  const isDoubled = member.contestant_id === doubled
                  const scored = member.points * (isDoubled ? 2 : 1)
                  return (
                    <span key={member.contestant_id} className="flex w-full items-center gap-1.5 text-sm">
                      <span className={lost ? ELIMINATED_DIM : undefined}>
                        <ContestantAvatar name={member.name} imageUrl={member.image_url} size="sm" tribeColor={member.tribe_color} tribeName={member.tribe_name} />
                      </span>
                      <span
                        className={`truncate ${lost ? ELIMINATED_STRIKE : ''} ${
                          isSoleSurvivor ? 'font-semibold text-gold-700' : 'text-paper-ink'
                        }`}
                        title={isSoleSurvivor ? 'Their Sole Survivor' : undefined}
                      >
                        {member.name}
                      </span>
                      {isDoubled && <PlayMark text="×2" title="Double Castaway Points on them this episode" />}
                      <span
                        className={`ml-auto shrink-0 font-medium tabular-nums ${
                          isDoubled && scored > 0
                            ? 'text-gold-700'
                            : scored > 0
                              ? 'text-jade-700'
                              : scored < 0
                                ? 'text-terracotta-600'
                                : 'text-paper-ink-faded'
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
                  // Two facts per vote, one channel each: gold is the Power
                  // Vote, a filled card is a hit, a dotted one missed. Whether
                  // it hit is the Hub's answer, so a Redemption Island duel
                  // loss doesn't read as a correct call (#655).
                  const power = vote.contestant_id === powerVote
                  const hit = vote.correct
                  return (
                    <span
                      key={vote.contestant_id}
                      title={power ? `${POWER_VOTE} on this vote` : undefined}
                      className={`inline-flex items-center rounded-md border-[1.5px] px-2 py-0.5 text-sm ${
                        power
                          ? hit
                            ? 'border-gold-600 bg-gold-200 font-semibold text-gold-800'
                            : 'border-dotted border-gold-500 text-gold-700'
                          : hit
                            ? 'border-jade-600 bg-jade-600/[.14] text-jade-800'
                            : 'border-dotted border-stone-400 text-paper-ink-faded'
                      }`}
                    >
                      {power && <span className="sr-only">{POWER_VOTE} — </span>}
                      {hit && <span className="sr-only">Correct — </span>}
                      {vote.name}
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

export function StandingsPage() {
  const { session } = useAuth()
  const userId = session?.user?.id
  // One row open at a time (#806).
  const [openId, setOpenId] = useState<string | null>(null)

  const { season, isLoading: seasonLoading, error: seasonError } = useActiveSeason()
  const standings = useQuery(
    pathQuery<StandingEntry[]>(season ? `/league-seasons/${season.id}/standings` : null),
  )
  // The week every row expands into. Both reads are their own queries rather
  // than a step of the page's load, so they fill in behind the standings
  // instead of holding them up — and a tap finds them already there (#812).
  const episodes = useQuery(
    pathQuery<Episode[]>(season ? `/seasons/${season.season_id}/episodes` : null),
  )
  // The latest locked episode from the roster lock on. The finale is left out —
  // its ballot is a bracket, not votes, and it reads as the pyramid on the Team
  // page (#82/#86, as on that page).
  const weekEpisode = useMemo(
    () =>
      (episodes.data ?? [])
        .filter(
          (e) =>
            episodeClosed(e) && !e.is_finale && e.episode_number >= (season?.roster_lock_episode ?? 1),
        )
        .sort((a, b) => b.episode_number - a.episode_number)[0],
    [episodes.data, season?.roster_lock_episode],
  )
  const hub = useQuery(
    pathQuery<HubEntry[]>(
      season && weekEpisode ? `/league-seasons/${season.id}/episodes/${weekEpisode.id}/hub` : null,
    ),
  )
  // A Hub that refuses (the episode never locked) reads as a week with nothing
  // in it, which is the panel's own empty state — not a page error.
  const hubByUser = useMemo(
    () => new Map((hub.data ?? []).map((e) => [e.user_id, e])),
    [hub.data],
  )
  const weekLoading = episodes.isLoading || hub.isLoading

  if (seasonLoading || standings.isLoading) return <PageLoader />
  const error = seasonError ?? standings.error
  if (error) return <Notice tone="error" title="Could not load standings">{error.message}</Notice>
  if (!season) return <ColdStart />

  const entries = standings.data ?? []
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
                    className={`group relative grid w-full grid-cols-[3.25rem_minmax(0,1fr)_6rem_3.25rem] items-center gap-2 px-4 py-2.5 text-left transition-colors md:grid-cols-[3.75rem_minmax(0,1fr)_6rem_3.75rem] md:gap-3 ${
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
                      episode={weekEpisode}
                      entry={hubByUser.get(entry.user_id)}
                      waiting={weekLoading}
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
