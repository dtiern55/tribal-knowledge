import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { LockedBadge } from '../components/LockBadge'
import { PageLoader } from '../components/PageLoader'
import { SectionShell } from '../components/SectionShell'
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
  TokenLedgerEntry,
} from '../types'

const DESCRIPTIONS: Record<string, string> = {
  double_roster_points: "Double one roster contestant's points for an episode.",
  double_vote_points: 'Double the points from all your elimination picks for an episode.',
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
  const [history, setHistory] = useState<TokenLedgerEntry[] | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  function toggleHistory() {
    if (!season || !userId) return
    if (history) {
      setHistory(null)
      return
    }
    setLoadingHistory(true)
    void api
      .get<TokenLedgerEntry[]>(`/seasons/${season.id}/tokens/${userId}/history`)
      .then(setHistory)
      .finally(() => setLoadingHistory(false))
  }

  // Friendly ledger description — allocations read "Episode N tokens" (#97).
  function txnDescription(h: TokenLedgerEntry): string {
    const cap = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
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
  // No open episode means play is over, so advantages are locked (#283).
  const advLocked = nextOpen ? advantagesLocked(nextOpen, season) : true
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

      <button
        onClick={toggleHistory}
        aria-expanded={history != null}
        className="w-full flex items-center justify-between p-4 bg-white border border-sand-200 rounded-xl mb-2 text-left hover:border-sand-300"
      >
        <span className="text-sm text-gray-500">
          Token balance
          <span className="text-gray-500"> · {history ? 'hide' : loadingHistory ? 'loading…' : 'tap for history'}</span>
        </span>
        <span className="text-xl font-semibold text-gray-900">{balance}</span>
      </button>
      {history && (
        <ul className="mb-6 space-y-1 text-sm border border-sand-200 rounded-xl p-3 bg-gray-50">
          {history.length === 0 && <li className="text-gray-500">No token activity yet.</li>}
          {history.map((h, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="text-gray-600">
                {txnDescription(h)}
                {h.transaction_type !== 'weekly_allocation' &&
                  h.transaction_type !== 'advantage_spend' &&
                  h.episode_number != null && (
                    <span className="text-gray-500"> · ep {h.episode_number}</span>
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
      {!history && <div className="mb-6" />}

      {actionError && <p className="text-red-600 text-sm mb-4">{actionError}</p>}

      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
        Your Advantages
      </h2>
      {inventory.length === 0 && inPlay.length === 0 && (
        <p className="text-sm text-gray-500 mb-8">
          Nothing owned.
        </p>
      )}
      <div className="space-y-2 mb-8">
        {inventory.map((p) => {
          // A swap credit follows the swap lock, everything else the advantage
          // lock — either way the card greys out and stamps Locked (#273).
          const isSwap = p.advantage_type === 'roster_swap'
          const locked = isSwap ? swapLocked : advLocked
          return (
            <div
              key={p.id}
              className={`p-3 border rounded-lg text-sm ${
                locked ? 'bg-gray-50 border-gray-200' : 'bg-white border-sand-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`font-medium ${locked ? 'text-gray-500' : 'text-gray-900'}`}>
                  {label(p.advantage_type)}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {locked && <LockedBadge />}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                    owned
                  </span>
                </span>
              </div>
              {locked ? (
                <p className="text-xs text-amber-700 mt-1">
                  {isSwap ? 'Swaps' : 'Advantages'} are locked for the rest of the season.
                </p>
              ) : (
                // Play everything on My Season (roster doubles in the roster
                // section, vote doubles / extra votes in the Weekly Votes section).
                // A swap credit deep-links straight to the swap control (#248).
                <p className="text-xs text-gray-500 mt-1">
                  Use it on the{' '}
                  <Link
                    to={isSwap ? '/#swap' : '/'}
                    className="text-jungle-700 font-medium underline"
                  >
                    My Tribe page
                  </Link>
                  .
                </p>
              )}
            </div>
          )
        })}

        {inPlay.map((p) => {
          // A played advantage is final once its lock passes — same greyed +
          // stamped treatment as inventory, and no take-back (#283).
          const isSwap = p.advantage_type === 'roster_swap'
          const locked = isSwap ? swapLocked : advLocked
          return (
            <div
              key={p.id}
              className={`p-3 border rounded-lg text-sm ${
                locked ? 'bg-gray-50 border-gray-200' : 'bg-ocean-50 border-ocean-100'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`font-medium ${locked ? 'text-gray-500' : 'text-ocean-900'}`}>
                  {label(p.advantage_type)}
                  {p.target_contestant_id && (
                    <span className={locked ? 'text-gray-500' : 'text-ocean-600'}>
                      {' '}
                      → {contestantMap.get(p.target_contestant_id)?.name ?? '—'}
                    </span>
                  )}
                  <span className={locked ? 'text-gray-500' : 'text-ocean-400'}>
                    {' '}
                    · Episode {playEpisode(p)?.episode_number}
                  </span>
                </span>
                {locked ? (
                  <LockedBadge />
                ) : (
                  <button
                    onClick={() => void takeBack(p)}
                    disabled={busy === `unuse:${p.id}`}
                    className="shrink-0 px-2.5 py-1 border border-ocean-300 text-xs text-ocean-700 hover:bg-ocean-100 font-medium rounded-lg transition-colors"
                  >
                    {busy === `unuse:${p.id}` ? 'Taking back…' : '↩ Take back'}
                  </button>
                )}
              </div>
              {locked ? (
                <p className="text-xs text-amber-700 mt-1">
                  {isSwap ? 'Swaps' : 'Advantages'} are locked for the rest of the season —
                  this one is committed.
                </p>
              ) : (
                <p className="text-xs text-ocean-500 mt-1">
                  Changed your mind? Take it back into inventory any time before
                  Episode {playEpisode(p)?.episode_number} locks — no tokens lost.
                </p>
              )}
            </div>
          )
        })}
      </div>

      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
        Shop
        {advLocked && <LockedBadge />}
      </h2>
      {lastPlayable && (
        <p className="text-sm text-amber-700 mb-3">
          ⚠️ This is the last episode to buy and play advantages — after this they lock.
        </p>
      )}
      <div className="space-y-4 mb-8">
        {/* Locked shop cards stay on the page, greyed and stamped, so the
            closed shop reads like the locked inventory items (#273, #283). */}
        {types.map((t) => (
          <div
            key={t.advantage_type}
            className={`p-4 border rounded-xl ${
              advLocked ? 'bg-gray-50 border-gray-200' : 'bg-white border-sand-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <p
                className={`font-semibold flex items-center gap-2 ${
                  advLocked ? 'text-gray-500' : 'text-gray-900'
                }`}
              >
                {t.label}
                {advLocked && <LockedBadge />}
              </p>
              <span className="text-xs text-gray-500 shrink-0">{t.token_cost} tokens</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">{DESCRIPTIONS[t.advantage_type] ?? ''}</p>
            {advLocked ? (
              <p className="text-xs text-amber-700">
                Advantages are locked for the rest of the season.
              </p>
            ) : (
              <button
                onClick={() => void buy(t.advantage_type, t.token_cost)}
                disabled={balance < t.token_cost || busy === `buy:${t.advantage_type}`}
                className="px-4 py-2 bg-jungle-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-jungle-700 transition-colors"
              >
                {busy === `buy:${t.advantage_type}` ? 'Buying…' : 'Buy'}
              </button>
            )}
          </div>
        ))}

        {/* Swap credits are bought here like any advantage, then spent on
            the My Tribe page (#202); pricing/cap stay per-season. */}
        <div
          className={`p-4 border rounded-xl ${
            swapLocked ? 'bg-gray-50 border-gray-200' : 'bg-white border-sand-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <p
              className={`font-semibold flex items-center gap-2 ${
                swapLocked ? 'text-gray-500' : 'text-gray-900'
              }`}
            >
              Roster Swap
              {swapLocked && <LockedBadge />}
            </p>
            <span className="text-xs text-gray-500 shrink-0">
              {freeSwapsLeft > 0
                ? `${freeSwapsLeft} free, then ${season.swap_token_cost} tokens`
                : `${season.swap_token_cost} tokens`}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Replace one of your roster picks with an unrostered castaway. Buy
            here, then use it on the{' '}
            <Link to="/#swap" className="text-jungle-700 font-medium underline">
              My Tribe page
            </Link>
            .
          </p>
          {swapLocked ? (
            <p className="text-xs text-amber-700">
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
              <span className="text-xs text-gray-500">
                {swapCredits.length > 0 && `${swapCredits.length} ready · `}
                {swapsAcquired} of {season.max_swaps} used
              </span>
            </div>
          )}
        </div>
      </div>

      {spent.length > 0 && (
        <SectionShell title="Play History" defaultOpen={false}>
          <ul className="space-y-2">
            {[...spent].reverse().map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg text-sm"
              >
                <span className="text-gray-700">
                  {label(p.advantage_type)}
                  {p.target_contestant_id && (
                    <span className="text-gray-500">
                      {' '}
                      → {contestantMap.get(p.target_contestant_id)?.name ?? '—'}
                    </span>
                  )}
                  <span className="text-gray-500"> · Episode {playEpisode(p)?.episode_number}</span>
                </span>
                <span className="text-xs text-gray-500 flex items-center gap-2 shrink-0">
                  {p.points_earned != null && (
                    <span
                      className={
                        p.points_earned > 0
                          ? 'text-green-600 font-medium'
                          : 'text-gray-500'
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
        </SectionShell>
      )}
    </div>
  )
}
