import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { PageLoader } from '../components/PageLoader'
import { api, getActiveSeason } from '../lib/api'
import { advantagesLocked, isEpisodeOpen, swapsLocked } from '../lib/episodes'
import { useAuth } from '../auth/useAuth'
import type {
  AdvantagePlay,
  AdvantageType,
  Contestant,
  Episode,
  RosterPick,
  Season,
} from '../types'

const DESCRIPTIONS: Record<string, string> = {
  double_roster_points: "Double one roster contestant's points for an episode.",
  double_vote_points: "Double one elimination pick's points for an episode.",
  extra_vote: 'Make one additional elimination pick in an episode.',
}

export function AdvantagesPage() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [season, setSeason] = useState<Season | null>(null)
  const [types, setTypes] = useState<AdvantageType[]>([])
  const [balance, setBalance] = useState(0)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [ownPlays, setOwnPlays] = useState<AdvantagePlay[]>([])
  const [roster, setRoster] = useState<RosterPick[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const active = await getActiveSeason()
        if (!active) return
        setSeason(active)

        const [advTypes, tokenBalance, cs, eps, plays, picks] = await Promise.all([
          api.get<AdvantageType[]>('/advantage-types'),
          api.get<{ balance: number }>(`/seasons/${active.id}/tokens/${userId}`),
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
          api.get<AdvantagePlay[]>(`/seasons/${active.id}/advantage-plays/${userId}`),
          api.get<RosterPick[]>(`/seasons/${active.id}/roster/${userId}`),
        ])
        setTypes(advTypes)
        setBalance(tokenBalance.balance)
        setContestants(cs)
        setEpisodes(eps)
        setOwnPlays(plays)
        setRoster(picks)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const episodeMap = new Map(episodes.map((e) => [e.id, e]))

  function replacePlay(updated: AdvantagePlay) {
    setOwnPlays((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }

  async function buy(advantageType: string, cost: number) {
    if (!season) return
    setBusy(`buy:${advantageType}`)
    setActionError(null)
    try {
      const created = await api.post<AdvantagePlay>(`/seasons/${season.id}/advantage-plays`, {
        advantage_type: advantageType,
      })
      setOwnPlays((prev) => [...prev, created])
      setBalance((prev) => prev - cost)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Buy failed')
    } finally {
      setBusy(null)
    }
  }

  async function takeBack(play: AdvantagePlay) {
    setBusy(`unuse:${play.id}`)
    setActionError(null)
    try {
      replacePlay(await api.delete<AdvantagePlay>(`/advantage-plays/${play.id}/use`))
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Take back failed')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <PageLoader />
  if (error) return <p className="text-red-600">{error}</p>
  if (!season) return <p className="text-gray-500">No active season.</p>

  const byType = new Map(types.map((t) => [t.advantage_type, t]))
  // roster_swap isn't in advantage_types (its cost is per-season), so name it here.
  const label = (t: string) =>
    byType.get(t)?.label ?? (t === 'roster_swap' ? 'Roster Swap' : t)

  const inventory = ownPlays.filter((p) => p.episode_id === null)
  const used = ownPlays.filter((p) => p.episode_id !== null)
  const playEpisode = (p: AdvantagePlay) =>
    p.episode_id ? episodeMap.get(p.episode_id) : undefined
  const inPlay = used.filter((p) => {
    const ep = playEpisode(p)
    return ep != null && isEpisodeOpen(ep, season)
  })
  const spent = used.filter((p) => !inPlay.includes(p))
  const nextOpen = episodes.find((e) => isEpisodeOpen(e, season))
  const advLocked = nextOpen ? advantagesLocked(nextOpen, season) : false
  // Swap is a bought-then-used advantage now (#202): buy a credit here, spend
  // it on the My Tribe page. Committed swaps + credits in hand both count
  // against the cap, and the first free_swaps of them are free.
  const swapsUsed = roster.filter((r) => r.active_until_episode !== null).length
  const swapCredits = inventory.filter((p) => p.advantage_type === 'roster_swap')
  const swapsAcquired = swapsUsed + swapCredits.length
  const freeSwapsLeft = Math.max(0, season.free_swaps - swapsAcquired)
  const swapBuyCost = freeSwapsLeft > 0 ? 0 : season.swap_token_cost
  const swapLocked = swapsLocked(season, episodes)
  const swapCapReached = swapsAcquired >= season.max_swaps
  // The last episode advantages can still be played (one before the cutoff).
  const lastPlayable =
    !advLocked &&
    season.advantage_lock_episode != null &&
    nextOpen?.episode_number === season.advantage_lock_episode - 1

  return (
    <div>
      <h1 className="font-display text-2xl md:text-3xl tracking-wide text-ocean-800 mb-1">{season.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Advantages</p>

      <div className="flex items-center justify-between p-4 bg-white border border-sand-200 rounded-xl mb-6">
        <span className="text-sm text-gray-500">Token balance</span>
        <span className="text-xl font-semibold text-gray-900">{balance}</span>
      </div>

      {actionError && <p className="text-red-600 text-sm mb-4">{actionError}</p>}

      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Shop</h2>
      {advLocked ? (
        <p className="text-sm text-amber-600 mb-8">
          Advantages are locked for the rest of the season — the shop is closed.
        </p>
      ) : (
        <>
          {lastPlayable && (
            <p className="text-sm text-amber-600 mb-3">
              ⚠️ This is the last episode to buy and play advantages — after this they lock.
            </p>
          )}
          <div className="space-y-4 mb-8">
            {types.map((t) => (
              <div key={t.advantage_type} className="p-4 bg-white border border-sand-200 rounded-xl">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-gray-900">{t.label}</p>
                  <span className="text-xs text-gray-400">{t.token_cost} tokens</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">{DESCRIPTIONS[t.advantage_type] ?? ''}</p>
                <button
                  onClick={() => void buy(t.advantage_type, t.token_cost)}
                  disabled={balance < t.token_cost || busy === `buy:${t.advantage_type}`}
                  className="px-4 py-2 bg-jungle-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-jungle-700 transition-colors"
                >
                  {busy === `buy:${t.advantage_type}` ? 'Buying…' : 'Buy'}
                </button>
              </div>
            ))}

            {/* Swap credits are bought here like any advantage, then spent on
                the My Tribe page (#202); pricing/cap stay per-season. */}
            <div className="p-4 bg-white border border-sand-200 rounded-xl">
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold text-gray-900">Roster Swap</p>
                <span className="text-xs text-gray-400">
                  {freeSwapsLeft > 0
                    ? `${freeSwapsLeft} free, then ${season.swap_token_cost} tokens`
                    : `${season.swap_token_cost} tokens`}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Replace one of your roster picks with an unrostered castaway. Buy
                here, then use it on the{' '}
                <Link to="/my-season#swap" className="text-jungle-700 font-medium underline">
                  My Tribe page
                </Link>
                .
              </p>
              {swapLocked ? (
                <p className="text-xs text-amber-600">
                  Swaps are locked for the rest of the season.
                </p>
              ) : swapCapReached ? (
                <p className="text-xs text-gray-500">
                  Swap limit reached — {swapsAcquired} of {season.max_swaps} used.
                </p>
              ) : (
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => void buy('roster_swap', swapBuyCost)}
                    disabled={balance < swapBuyCost || busy === 'buy:roster_swap'}
                    className="px-4 py-2 bg-jungle-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-jungle-700 transition-colors"
                  >
                    {busy === 'buy:roster_swap' ? 'Buying…' : 'Buy'}
                  </button>
                  <span className="text-xs text-gray-400">
                    {swapCredits.length > 0 && `${swapCredits.length} ready · `}
                    {swapsAcquired} of {season.max_swaps} used
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
        Your Advantages
      </h2>
      {inventory.length === 0 && inPlay.length === 0 && (
        <p className="text-sm text-gray-400 mb-8">
          Nothing owned yet — buy an advantage above and it'll wait here until you use it.
        </p>
      )}
      <div className="space-y-2 mb-8">
        {inventory.map((p) => (
          <div
            key={p.id}
            className="p-3 bg-white border border-sand-200 rounded-lg text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">{label(p.advantage_type)}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                owned
              </span>
            </div>
            {advLocked ? (
              <p className="text-xs text-amber-600 mt-1">
                Advantages are locked for the rest of the season.
              </p>
            ) : (
              // Play everything on My Season (roster doubles in the roster
              // section, vote doubles / extra votes in the Weekly Votes section).
              // A swap credit deep-links straight to the swap control (#248).
              <p className="text-xs text-gray-500 mt-1">
                Use it on the{' '}
                <Link
                  to={p.advantage_type === 'roster_swap' ? '/my-season#swap' : '/my-season'}
                  className="text-jungle-700 font-medium underline"
                >
                  My Tribe page
                </Link>
                .
              </p>
            )}
          </div>
        ))}

        {inPlay.map((p) => (
          <div
            key={p.id}
            className="p-3 bg-ocean-50 border border-ocean-100 rounded-lg text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-ocean-900">
                {label(p.advantage_type)}
                {p.target_contestant_id && (
                  <span className="text-ocean-600">
                    {' '}
                    → {contestantMap.get(p.target_contestant_id)?.name ?? '—'}
                  </span>
                )}
                <span className="text-ocean-400">
                  {' '}
                  · Episode {playEpisode(p)?.episode_number}
                </span>
              </span>
              <button
                onClick={() => void takeBack(p)}
                disabled={busy === `unuse:${p.id}`}
                className="shrink-0 px-2.5 py-1 border border-ocean-300 text-xs text-ocean-700 hover:bg-ocean-100 font-medium rounded-lg transition-colors"
              >
                {busy === `unuse:${p.id}` ? 'Taking back…' : '↩ Take back'}
              </button>
            </div>
            <p className="text-xs text-ocean-500 mt-1">
              Changed your mind? Take it back into inventory any time before
              Episode {playEpisode(p)?.episode_number} locks — no tokens lost.
            </p>
          </div>
        ))}
      </div>

      {spent.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Play History
          </h2>
          <ul className="space-y-2">
            {[...spent].reverse().map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm"
              >
                <span className="text-gray-700">
                  {label(p.advantage_type)}
                  {p.target_contestant_id && (
                    <span className="text-gray-400">
                      {' '}
                      → {contestantMap.get(p.target_contestant_id)?.name ?? '—'}
                    </span>
                  )}
                  <span className="text-gray-400"> · Episode {playEpisode(p)?.episode_number}</span>
                </span>
                <span className="text-xs text-gray-400 flex items-center gap-2 shrink-0">
                  {p.points_earned != null && (
                    <span
                      className={
                        p.points_earned > 0
                          ? 'text-green-600 font-medium'
                          : 'text-gray-400'
                      }
                    >
                      {p.points_earned > 0 ? '+' : ''}
                      {p.points_earned} pts
                    </span>
                  )}
                  <span>{p.token_cost} tokens</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
