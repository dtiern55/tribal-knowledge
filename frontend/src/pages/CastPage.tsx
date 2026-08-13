import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ContestantPortrait } from '../components/ContestantPortrait'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { PageLoader } from '../components/PageLoader'
import { api, getActiveSeason } from '../lib/api'
import { castStatus, filterAndSortCast } from '../lib/cast'
import type { CastFilter, CastSort } from '../lib/cast'
import type { CastMember, Season } from '../types'

const FILTERS: { value: CastFilter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'active', label: 'Still in' },
  { value: 'eliminated', label: 'Eliminated' },
]

export function CastPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [cast, setCast] = useState<CastMember[]>([])
  const [season, setSeason] = useState<Season | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const filter = (['all', 'active', 'eliminated'].includes(searchParams.get('status') ?? '')
    ? searchParams.get('status')
    : 'all') as CastFilter
  const sort = (searchParams.get('sort') === 'name' ? 'name' : 'score') as CastSort

  useEffect(() => {
    async function load() {
      try {
        const active = await getActiveSeason()
        setSeason(active)
        if (active) setCast(await api.get<CastMember[]>(`/seasons/${active.id}/cast`))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load cast')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  function setBrowseState(next: { status?: CastFilter; sort?: CastSort }) {
    const params = new URLSearchParams(searchParams)
    const nextFilter = next.status ?? filter
    const nextSort = next.sort ?? sort
    if (nextFilter === 'all') params.delete('status')
    else params.set('status', nextFilter)
    if (nextSort === 'score') params.delete('sort')
    else params.set('sort', nextSort)
    setSearchParams(params, { replace: true })
  }

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load the cast">{error}</Notice>
  if (!season) return <Notice title="No season found">Choose an active season from the menu.</Notice>

  const visible = filterAndSortCast(cast, filter, sort)
  const activeCount = cast.filter((member) => member.eliminated_in_episode == null).length
  const counts: Record<CastFilter, number> = {
    all: cast.length,
    active: activeCount,
    eliminated: cast.length - activeCount,
  }
  const castContext = searchParams.toString()

  return (
    <div>
      <PageHeader
        eyebrow={season.name}
        title="Cast"
        description={`${activeCount} of ${cast.length} castaways are still in the game. Open anyone to see their episode-by-episode performance.`}
      />

      <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-sand-200 bg-white p-3 sm:flex-row sm:items-end sm:justify-between sm:p-4">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Show</p>
          <div className="flex max-w-full gap-1 overflow-x-auto pb-1" aria-label="Filter cast by status">
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setBrowseState({ status: value })}
                className={`shrink-0 rounded-full px-3 py-2 text-sm font-medium transition ${
                  filter === value ? 'bg-ocean-700 text-white' : 'bg-sand-100 text-gray-700 hover:bg-sand-200'
                }`}
              >
                {label} <span className={filter === value ? 'text-ocean-100' : 'text-gray-500'}>{counts[value]}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="flex shrink-0 items-center justify-between gap-3 text-sm text-gray-600 sm:block">
          <span className="font-medium sm:mb-2 sm:block">Sort by</span>
          <select
            value={sort}
            onChange={(event) => setBrowseState({ sort: event.target.value as CastSort })}
            className="min-w-36 rounded-lg border border-sand-300 bg-white px-3 py-2 text-gray-800"
          >
            <option value="score">Season points</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      {cast.length === 0 ? (
        <Notice title="Cast not added yet">Contestants will appear here once the commissioner adds them.</Notice>
      ) : visible.length === 0 ? (
        <Notice title={`No ${filter === 'active' ? 'active' : 'eliminated'} castaways`}>
          Choose another status to see the rest of the cast.
        </Notice>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {visible.map((member) => {
            const eliminated = member.eliminated_in_episode != null
            const detailQuery = castContext ? `?cast=${encodeURIComponent(castContext)}` : ''
            return (
              <li key={member.id}>
                <Link
                  to={`/contestants/${member.id}${detailQuery}`}
                  className="group block h-full overflow-hidden rounded-2xl border border-sand-200 bg-white transition hover:-translate-y-0.5 hover:border-ocean-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-600"
                >
                  <div className="relative overflow-hidden bg-sand-100">
                    <ContestantPortrait
                      name={member.name}
                      imageUrl={member.image_url}
                      crop="card"
                      className={`transition duration-300 group-hover:scale-[1.02] ${eliminated ? 'grayscale opacity-75' : ''}`}
                    />
                    <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${
                      eliminated ? 'bg-stone-800/85 text-white' : 'bg-jungle-700 text-white'
                    }`}>
                      {member.placement != null ? `Placed #${member.placement}` : eliminated ? `Out · Ep ${member.eliminated_in_episode}` : 'Still in'}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-xl tracking-wide text-ocean-900 group-hover:text-ocean-700">{member.name}</h2>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
                          {member.tribe_name ? (
                            <>
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: member.tribe_color ?? undefined }} />
                              <span className="truncate">{member.tribe_name} tribe</span>
                            </>
                          ) : 'No tribe assigned'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-lg font-bold ${member.total_points > 0 ? 'text-green-700' : member.total_points < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {member.total_points > 0 ? '+' : ''}{member.total_points}
                        </p>
                        <p className="text-[11px] text-gray-500">season pts</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-sand-100 pt-3 text-xs">
                      <span className="text-gray-500">{castStatus(member)}</span>
                      <span className="font-semibold text-ocean-700">View profile →</span>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
