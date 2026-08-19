import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { ContestantAvatar } from '../components/ContestantAvatar'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { api, getActiveSeason } from '../lib/api'
import { movementLabel, rankStandings } from '../lib/standings'
import type { Season, StandingEntry } from '../types'

function Trend({ entry }: { entry: StandingEntry }) {
  const label = movementLabel(entry)
  if (!label) return null
  const color =
    entry.trend === 'up'
      ? 'text-jade-700'
      : entry.trend === 'down'
        ? 'text-terracotta-600'
        : 'text-gray-500'
  return <span className={`text-xs font-medium ${color}`}>{label}</span>
}

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
    <span className="relative inline-flex flex-col items-start leading-none">
      {up && (
        <span className="absolute bottom-full left-0 mb-1">
          <Movement up delta={entry.trend_delta} />
        </span>
      )}
      <span
        className={`font-display text-2xl font-bold leading-none ${rank === 1 ? 'text-gold-600' : 'text-stone-500'}`}
        aria-label={`${tied ? 'Tied at ' : ''}rank ${rank}`}
      >
        {rank}
      </span>
      {down && (
        <span className="absolute top-full left-0 mt-1">
          <Movement up={false} delta={entry.trend_delta} />
        </span>
      )}
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
  if (!season) return <Notice title="No season found">Choose an active season from the menu.</Notice>

  const ranked = rankStandings(entries)
  const mine = ranked.find(({ entry }) => entry.user_id === userId)
  const showFinale = season.status === 'completed' || entries.some((e) => e.finale_points !== 0)
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
          className="mb-6 block border-b-2 border-forest-700 px-1 pb-4 transition-colors hover:border-terracotta-600"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest-700">
                Your position
              </p>
              <p className="mt-1 font-display text-2xl tracking-wide text-forest-900">
                {mine.tied ? `Tied for #${mine.rank}` : `#${mine.rank}`}
                <span className="ml-2 font-sans text-sm font-normal tracking-normal text-gray-600">
                  of {ranked.length}
                </span>
              </p>
              <div className="mt-1"><Trend entry={mine.entry} /></div>
            </div>
            <div className="text-right">
              <p className="font-display text-3xl font-bold text-forest-900">{mine.entry.total_points}</p>
              <p className="text-xs text-gray-500">season points</p>
            </div>
          </div>
        </Link>
      )}

      {ranked.length === 0 ? (
        <Notice title="No players yet">The standings will appear after players join this season.</Notice>
      ) : (
        <section aria-label="League standings">
          <div className="mb-2 hidden grid-cols-[3.5rem_minmax(0,1fr)_repeat(3,minmax(4.5rem,.45fr))_6rem] gap-3 border-b-2 border-forest-100 px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-forest-700 md:grid">
            <span>Rank</span><span>Player</span><span className="text-right">Roster</span>
            <span className="text-right">Ballot</span>
            <span className={`text-right ${showFinale ? '' : 'invisible'}`}>Finale</span>
            <span className="text-right">Total</span>
          </div>
          <ol className="divide-y divide-cream-300 border-b border-cream-300">
            {ranked.map(({ entry, rank, tied }) => {
              const isMe = entry.user_id === userId
              return (
                <li key={entry.user_id}>
                  <Link
                    to={`/seasons/${season.id}/team/${entry.user_id}`}
                    aria-current={isMe ? 'true' : undefined}
                    className={`group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 px-1 py-4 transition-colors md:grid-cols-[3.5rem_minmax(0,1fr)_repeat(3,minmax(4.5rem,.45fr))_6rem] ${
                      isMe ? 'bg-forest-50/45' : 'hover:bg-cream-50/70'
                    }`}
                  >
                    <Rank rank={rank} tied={tied} entry={entry} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-display text-lg font-semibold text-gray-900 group-hover:text-forest-700">{entry.display_name}</span>
                        {isMe && <span className="rounded bg-jade-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">You</span>}
                      </div>
                      <p className="mt-1 text-xs text-gray-500 md:hidden">
                        Roster {entry.roster_points} · Ballot {entry.elimination_points}
                        {showFinale ? ` · Finale ${entry.finale_points}` : ''}
                      </p>
                      {entry.active_survivors.length > 0 && (
                        <span className="mt-2 flex -space-x-2 pl-0.5">
                          {entry.active_survivors.map((survivor) => (
                            <span key={survivor.contestant_id} className="rounded-full" title={survivor.name}>
                              <ContestantAvatar
                                name={survivor.name}
                                imageUrl={survivor.image_url}
                                tribeColor={survivor.tribe_color}
                                tribeName={survivor.tribe_name}
                              />
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    <span className="hidden text-right text-gray-700 md:block">{entry.roster_points}</span>
                    <span className="hidden text-right text-gray-700 md:block">{entry.elimination_points}</span>
                    <span className={`hidden text-right text-gray-700 md:block ${showFinale ? '' : 'invisible'}`}>{entry.finale_points}</span>
                    <div className="text-right">
                      <p className="font-display text-xl font-bold text-forest-900">{entry.total_points}</p>
                      {entry.last_episode_points !== 0 ? (
                        <p className={`text-[11px] font-medium ${entry.last_episode_points > 0 ? 'text-jade-700' : 'text-terracotta-600'}`}>
                          {entry.last_episode_points > 0 ? '+' : ''}{entry.last_episode_points} last ep
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-400">{hasScoring ? 'No change' : 'Not scored yet'}</p>
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
