import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import { formatCentral } from '../lib/time'
import { useAuth } from '../auth/useAuth'
import type { Contestant, Episode, FinalePrediction, Season } from '../types'

export function FinalePage() {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [season, setSeason] = useState<Season | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [finaleEp, setFinaleEp] = useState<Episode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [earlyBoot, setEarlyBoot] = useState('')
  const [fireLoss, setFireLoss] = useState('')
  const [winner, setWinner] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const active = await getActiveSeason()
        if (!active) return
        setSeason(active)

        const [cs, eps] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
        ])
        setContestants(cs)
        const finale = eps.find((e) => e.is_finale) ?? null
        setFinaleEp(finale)

        try {
          const pred = await api.get<FinalePrediction>(
            `/seasons/${active.id}/finale-predictions/${userId}`,
          )
          setEarlyBoot(pred.early_boot_contestant_id ?? '')
          setFireLoss(pred.fire_loss_contestant_id ?? '')
          setWinner(pred.winner_contestant_id ?? '')
        } catch {
          // No prediction yet — form starts empty
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  const windowOpen =
    finaleEp != null
      ? finaleEp.status !== 'scored' && new Date(finaleEp.picks_lock_at) > new Date()
      : false

  async function submitBallot() {
    if (!season) return
    setSubmitting(true)
    setSubmitError(null)
    setSaved(false)
    try {
      await api.post<FinalePrediction>(`/seasons/${season.id}/finale-predictions`, {
        early_boot_contestant_id: earlyBoot || null,
        fire_loss_contestant_id: fireLoss || null,
        winner_contestant_id: winner || null,
      })
      setSaved(true)
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>
  if (!season) return <p className="text-gray-500">No active season.</p>

  if (!finaleEp) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">{season.name}</h1>
        <p className="text-sm text-gray-500 mb-6">Finale Ballot</p>
        <p className="text-sm text-gray-500">Finale episode not yet scheduled.</p>
      </div>
    )
  }

  if (!windowOpen) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">{season.name}</h1>
        <p className="text-sm text-gray-500 mb-6">Finale Ballot</p>
        <p className="text-sm text-gray-500">Finale ballot is closed.</p>
      </div>
    )
  }

  const selects = [
    {
      id: 'early-boot',
      label: 'First Boot (Finale Night)',
      description: 'First person eliminated during the finale episode',
      value: earlyBoot,
      onChange: setEarlyBoot,
    },
    {
      id: 'fire-loss',
      label: 'Fire-Making Loser',
      description: 'Loses the fire-making challenge and is eliminated',
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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">{season.name}</h1>
      <p className="text-sm text-gray-500 mb-6">Finale Ballot</p>
      <p className="text-sm text-gray-600 mb-1">
        All fields are optional. Submit as many or as few as you like.
      </p>
      <p className="text-xs text-gray-400 mb-6">
        Locks {formatCentral(finaleEp.picks_lock_at)} · you can update until then
      </p>

      <div className="space-y-5 mb-6">
        {selects.map(({ id, label, description, value, onChange }) => (
          <div key={id}>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
              {label}
            </label>
            <p className="text-xs text-gray-400 mb-2">{description}</p>
            <select
              value={value}
              onChange={(e) => {
                onChange(e.target.value)
                setSaved(false)
              }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">No pick</option>
              {contestants
                .filter((c) => c.eliminated_in_episode == null)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        ))}
      </div>

      {submitError && <p className="text-red-600 text-sm mb-4">{submitError}</p>}
      {saved && <p className="text-green-600 text-sm mb-4">Ballot saved.</p>}

      <button
        onClick={submitBallot}
        disabled={submitting}
        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-indigo-700 transition-colors"
      >
        {submitting ? 'Saving…' : 'Save Ballot'}
      </button>
    </div>
  )
}
