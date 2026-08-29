import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { ColdStart } from '../components/ColdStart'
import { ContestantAvatar, ELIMINATED_DIM } from '../components/ContestantAvatar'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { api, getActiveSeason } from '../lib/api'
import { rankStandings } from '../lib/standings'
import type { Season, StandingEntry, StandingSurvivor } from '../types'

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

// The overlapping castaway cluster on a row: still-in at full color, recently
// eliminated dimmed. Small (sm) so the row stays a single line.
function SurvivorCluster({ active, eliminated }: { active: StandingSurvivor[]; eliminated: StandingSurvivor[] }) {
  if (active.length === 0 && eliminated.length === 0) return null
  return (
    <span className="flex flex-none -space-x-2">
      {active.map((s) => (
        <span key={s.contestant_id} className="rounded-full" title={s.name}>
          <ContestantAvatar name={s.name} imageUrl={s.image_url} size="sm" tribeColor={s.tribe_color} tribeName={s.tribe_name} />
        </span>
      ))}
      {eliminated.map((s) => (
        <span key={s.contestant_id} className={`rounded-full ${ELIMINATED_DIM}`} title={`Eliminated ep ${s.eliminated_episode}`}>
          <ContestantAvatar name={s.name} imageUrl={s.image_url} size="sm" tribeColor={s.tribe_color} tribeName={s.tribe_name} />
        </span>
      ))}
    </span>
  )
}

export function StandingsPage() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [seasons, setSeasons] = useState<Season[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [entries, setEntries] = useState<StandingEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const [ss, current] = await Promise.all([
          api.get<Season[]>('/seasons'),
          getActiveSeason(),
        ])
        if (!live) return
        setSeasons(ss)
        const activeId = current?.id ?? ''
        setSelectedId(activeId)
        if (activeId) {
          const standings = await api.get<StandingEntry[]>(`/seasons/${activeId}/standings`)
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

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load standings">{error}</Notice>
  const season = seasons.find((s) => s.id === selectedId)
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
          to={`/seasons/${season.id}/team/${mine.entry.user_id}`}
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
          <div className="flex items-center justify-between border-b border-paper-line px-4 py-2.5">
            <span className="font-display text-[11px] font-bold uppercase tracking-[0.13em] text-forest-700">League</span>
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-paper-ink-faded">
              {ranked.length} players
            </span>
          </div>
          <ol>
            {ranked.map(({ entry, rank, tied }) => {
              const isMe = entry.user_id === userId
              return (
                <li key={entry.user_id}>
                  <Link
                    to={`/seasons/${season.id}/team/${entry.user_id}`}
                    aria-current={isMe ? 'true' : undefined}
                    className={`group relative grid grid-cols-[2.25rem_minmax(0,1fr)_5.5rem_3.25rem] items-center gap-3 border-b border-paper-line px-4 py-2.5 transition-colors last:border-b-0 md:grid-cols-[3rem_minmax(0,1fr)_6rem_3.75rem] ${
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
                    </div>
                    {/* Portraits sit in a fixed-width column just left of the
                        score — as far right as possible — and left-align inside
                        it, so their left edges line up row to row on any screen.
                        The flexible name column absorbs width differences. */}
                    <div className="flex min-w-0 justify-start overflow-hidden">
                      <SurvivorCluster active={entry.active_survivors} eliminated={entry.recently_eliminated_survivors} />
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
                  </Link>
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </div>
  )
}
