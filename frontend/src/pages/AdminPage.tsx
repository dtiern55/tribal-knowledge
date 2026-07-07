import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { centralLocalToUtc, utcToCentralLocal } from '../lib/time'
import { useAuth } from '../auth/useAuth'
import type { Contestant, Episode, Season } from '../types'

// ─── Scoring event types (from migrations) ───────────────────────────────────

const SCORING_EVENT_TYPES: { value: string; label: string; perUnit?: boolean }[] = [
  { value: 'idol_played_successfully', label: 'Save with idol (successfully played)' },
  { value: 'shot_in_the_dark_success', label: 'Shot in the dark (success)' },
  { value: 'win_individual_immunity', label: 'Win individual immunity' },
  { value: 'win_individual_reward', label: 'Win individual reward' },
  { value: 'win_fire_making_challenge', label: 'Win fire-making challenge' },
  { value: 'blindside_with_active_idol', label: 'Blindside with active idol' },
  { value: 'join_jury', label: 'Join the jury' },
  { value: 'acquire_active_idol', label: 'Acquire active idol' },
  { value: 'acquire_extra_vote', label: 'Acquire extra vote' },
  { value: 'win_team_immunity', label: 'Win team immunity' },
  { value: 'acquire_inactive_idol', label: 'Acquire inactive idol' },
  { value: 'activate_inactive_idol', label: 'Activate inactive idol' },
  { value: 'win_team_reward', label: 'Win team reward' },
  { value: 'acquire_other_advantage', label: 'Acquire other advantage' },
  { value: 'vote_correctly_at_tribal', label: 'Vote correctly at tribal' },
  { value: 'votes_received', label: 'Votes received at tribal', perUnit: true },
  { value: 'eliminated_holding_idol', label: 'Eliminated holding idol' },
  { value: 'steal_immunity_idol', label: 'Steal immunity idol (token)' },
  { value: 'play_idol_nullifier', label: 'Play idol nullifier (token)' },
  { value: 'use_steal_a_vote', label: 'Use steal-a-vote (token)' },
  { value: 'use_extra_vote', label: 'Use extra vote (token)' },
  { value: 'fake_idol_played', label: 'Fake idol gets played (token)' },
]

const ELIMINATION_TYPES = [
  { value: 'voted_out', label: 'Voted out' },
  { value: 'medical_evacuation', label: 'Medical evacuation' },
  { value: 'quit', label: 'Quit' },
  { value: 'fire_making_loss', label: 'Fire-making loss' },
]

// ─── Shared helpers ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-4 mt-8 first:mt-0">
      {title}
    </h2>
  )
}

function ErrorMsg({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p className="text-red-600 text-sm mt-2">{msg}</p>
}

function SuccessMsg({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p className="text-green-600 text-sm mt-2">{msg}</p>
}

function ActionBtn({
  onClick,
  disabled,
  children,
  variant = 'primary',
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  const cls =
    variant === 'primary'
      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
      : variant === 'danger'
        ? 'bg-red-600 text-white hover:bg-red-700'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-40 transition-colors ${cls}`}
    >
      {children}
    </button>
  )
}

// ─── Season section ───────────────────────────────────────────────────────────

function SeasonSection({
  season,
  onUpdated,
}: {
  season: Season
  onUpdated: (s: Season) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(season.name)
  const [mergeEp, setMergeEp] = useState(String(season.merge_episode ?? ''))
  const [lockEp, setLockEp] = useState(String(season.roster_lock_episode ?? ''))
  const [penalty, setPenalty] = useState(String(season.swap_penalty_points))
  const [status, setStatus] = useState(season.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await api.patch<Season>(`/seasons/${season.id}`, {
        name,
        merge_episode: mergeEp ? Number(mergeEp) : null,
        roster_lock_episode: lockEp ? Number(lockEp) : null,
        swap_penalty_points: Number(penalty),
        status,
      })
      onUpdated(updated)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="p-4 bg-white border border-gray-200 rounded-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-gray-900">{season.name}</p>
            <p className="text-sm text-gray-500 mt-1">
              Season #{season.season_number} · {season.status} · roster locks ep{' '}
              {season.roster_lock_episode ?? '—'} · merge ep {season.merge_episode ?? '—'} · swap
              penalty {season.swap_penalty_points} pts
            </p>
          </div>
          <ActionBtn variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </ActionBtn>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Season['status'])}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="upcoming">upcoming</option>
            <option value="active">active</option>
            <option value="completed">completed</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Swap penalty pts</label>
          <input
            type="number"
            value={penalty}
            onChange={(e) => setPenalty(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Roster lock episode</label>
          <input
            type="number"
            value={lockEp}
            onChange={(e) => setLockEp(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Merge episode</label>
          <input
            type="number"
            value={mergeEp}
            onChange={(e) => setMergeEp(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>
      <ErrorMsg msg={error} />
      <div className="flex gap-2">
        <ActionBtn onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </ActionBtn>
        <ActionBtn variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </ActionBtn>
      </div>
    </div>
  )
}

// ─── Contestants section ──────────────────────────────────────────────────────

function ContestantsSection({
  seasonId,
  contestants,
  onUpdated,
}: {
  seasonId: string
  contestants: Contestant[]
  onUpdated: (cs: Contestant[]) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPlacement, setEditPlacement] = useState('')
  const [saving, setSaving] = useState(false)
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  function startEdit(c: Contestant) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditPlacement(c.placement != null ? String(c.placement) : '')
    setEditError(null)
  }

  async function saveEdit(id: string) {
    setSaving(true)
    setEditError(null)
    try {
      const updated = await api.patch<Contestant>(`/contestants/${id}`, {
        name: editName,
        placement: editPlacement ? Number(editPlacement) : null,
      })
      onUpdated(contestants.map((c) => (c.id === id ? updated : c)))
      setEditingId(null)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function addContestants() {
    const names = addText
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean)
    if (!names.length) return
    setAdding(true)
    setAddError(null)
    try {
      const added = await api.post<Contestant[]>(`/seasons/${seasonId}/contestants`, { names })
      onUpdated([...contestants, ...added])
      setAddText('')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-2">
      {contestants.map((c) =>
        editingId === c.id ? (
          <div
            key={c.id}
            className="flex items-center gap-2 p-3 bg-white border border-indigo-200 rounded-lg"
          >
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="Name"
            />
            <input
              type="number"
              value={editPlacement}
              onChange={(e) => setEditPlacement(e.target.value)}
              className="w-20 border border-gray-200 rounded px-2 py-1 text-sm"
              placeholder="Place"
            />
            <ActionBtn onClick={() => saveEdit(c.id)} disabled={saving}>
              {saving ? '…' : 'Save'}
            </ActionBtn>
            <ActionBtn variant="secondary" onClick={() => setEditingId(null)}>
              ✕
            </ActionBtn>
            <ErrorMsg msg={editError} />
          </div>
        ) : (
          <div
            key={c.id}
            className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg"
          >
            <span className="text-sm text-gray-900">
              {c.name}
              {c.placement != null && (
                <span className="ml-2 text-xs text-gray-400">#{c.placement}</span>
              )}
            </span>
            <ActionBtn variant="secondary" onClick={() => startEdit(c)}>
              Edit
            </ActionBtn>
          </div>
        ),
      )}

      <div className="mt-4 p-4 bg-gray-50 border border-gray-100 rounded-xl">
        <p className="text-xs font-semibold text-gray-500 mb-2">Add contestants (one per line)</p>
        <textarea
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          rows={4}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2"
          placeholder="Castaway 01&#10;Castaway 02"
        />
        <ErrorMsg msg={addError} />
        <ActionBtn onClick={addContestants} disabled={adding || !addText.trim()}>
          {adding ? 'Adding…' : 'Add'}
        </ActionBtn>
      </div>
    </div>
  )
}

// ─── Episode panel (expanded) ─────────────────────────────────────────────────

interface ScoringEventDraft {
  key: number
  contestant_id: string
  event_type: string
  quantity: number
}

interface EliminationDraft {
  contestant_id: string
  elimination_type: string
}

function EpisodePanel({
  episode,
  contestants,
  onUpdated,
}: {
  episode: Episode
  contestants: Contestant[]
  onUpdated: (ep: Episode) => void
}) {
  // Edit fields
  const [epNum, setEpNum] = useState(String(episode.episode_number))
  const [airDate, setAirDate] = useState(episode.air_date)
  const [locksAt, setLocksAt] = useState(utcToCentralLocal(episode.picks_lock_at))
  const [maxPicks, setMaxPicks] = useState(String(episode.max_elimination_picks))
  const [isFinale, setIsFinale] = useState(episode.is_finale)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Eliminations
  const [elimDrafts, setElimDrafts] = useState<EliminationDraft[]>([])
  const [elimLoaded, setElimLoaded] = useState(false)
  const [elimSaving, setElimSaving] = useState(false)
  const [elimError, setElimError] = useState<string | null>(null)
  const [elimSuccess, setElimSuccess] = useState<string | null>(null)

  // Scoring events
  const [eventDrafts, setEventDrafts] = useState<ScoringEventDraft[]>([])
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [nextKey, setNextKey] = useState(0)
  const [newContestant, setNewContestant] = useState('')
  const [newEventType, setNewEventType] = useState(SCORING_EVENT_TYPES[0].value)
  const [newQty, setNewQty] = useState(1)
  const [eventsSaving, setEventsSaving] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)
  const [eventsSuccess, setEventsSuccess] = useState<string | null>(null)

  // Score episode
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [scoreSuccess, setScoreSuccess] = useState<string | null>(null)

  useEffect(() => {
    // Load eliminations and scoring events when panel opens
    async function loadData() {
      const [elims, events] = await Promise.all([
        api
          .get<{ contestant_id: string; elimination_type: string }[]>(
            `/episodes/${episode.id}/eliminations`,
          )
          .catch(() => []),
        api
          .get<{ contestant_id: string; event_type: string; quantity: number }[]>(
            `/episodes/${episode.id}/scoring-events`,
          )
          .catch(() => []),
      ])
      setElimDrafts(elims.map((e) => ({ contestant_id: e.contestant_id, elimination_type: e.elimination_type })))
      setElimLoaded(true)
      let k = 0
      setEventDrafts(
        events.map((e) => ({
          key: k++,
          contestant_id: e.contestant_id,
          event_type: e.event_type,
          quantity: e.quantity,
        })),
      )
      setNextKey(k)
      setEventsLoaded(true)
    }
    void loadData()
  }, [episode.id])

  async function saveEpisode() {
    setEditSaving(true)
    setEditError(null)
    try {
      const updated = await api.patch<Episode>(`/episodes/${episode.id}`, {
        episode_number: Number(epNum),
        air_date: airDate,
        picks_lock_at: centralLocalToUtc(locksAt),
        max_elimination_picks: Number(maxPicks),
        is_finale: isFinale,
      })
      onUpdated(updated)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setEditSaving(false)
    }
  }

  function toggleElim(contestantId: string) {
    setElimDrafts((prev) => {
      const exists = prev.some((e) => e.contestant_id === contestantId)
      if (exists) return prev.filter((e) => e.contestant_id !== contestantId)
      return [...prev, { contestant_id: contestantId, elimination_type: 'voted_out' }]
    })
  }

  function setElimType(contestantId: string, type: string) {
    setElimDrafts((prev) =>
      prev.map((e) => (e.contestant_id === contestantId ? { ...e, elimination_type: type } : e)),
    )
  }

  async function saveEliminations() {
    setElimSaving(true)
    setElimError(null)
    setElimSuccess(null)
    try {
      await api.post(`/episodes/${episode.id}/eliminations`, elimDrafts)
      setElimSuccess('Eliminations saved.')
    } catch (e) {
      setElimError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setElimSaving(false)
    }
  }

  function addEventDraft() {
    if (!newContestant) return
    setEventDrafts((prev) => [
      ...prev,
      { key: nextKey, contestant_id: newContestant, event_type: newEventType, quantity: newQty },
    ])
    setNextKey((k) => k + 1)
    setNewQty(1)
  }

  function removeEventDraft(key: number) {
    setEventDrafts((prev) => prev.filter((e) => e.key !== key))
  }

  async function saveScoringEvents() {
    setEventsSaving(true)
    setEventsError(null)
    setEventsSuccess(null)
    try {
      await api.post(
        `/episodes/${episode.id}/scoring-events`,
        eventDrafts.map(({ contestant_id, event_type, quantity }) => ({
          contestant_id,
          event_type,
          quantity,
        })),
      )
      setEventsSuccess('Scoring events saved.')
    } catch (e) {
      setEventsError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setEventsSaving(false)
    }
  }

  async function scoreEpisode() {
    setScoring(true)
    setScoreError(null)
    setScoreSuccess(null)
    try {
      const updated = await api.post<Episode>(`/episodes/${episode.id}/score`, {})
      onUpdated(updated)
      setScoreSuccess('Episode scored.')
    } catch (e) {
      setScoreError(e instanceof Error ? e.message : 'Score failed')
    } finally {
      setScoring(false)
    }
  }

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const selectedElimIds = new Set(elimDrafts.map((e) => e.contestant_id))

  return (
    <div className="mt-3 space-y-6 pt-4 border-t border-gray-100">
      {/* Edit episode */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-3">Edit Episode</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Episode #</label>
            <input
              type="number"
              value={epNum}
              onChange={(e) => setEpNum(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Air date</label>
            <input
              type="date"
              value={airDate}
              onChange={(e) => setAirDate(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Picks lock at (CT)</label>
            <input
              type="datetime-local"
              value={locksAt}
              onChange={(e) => setLocksAt(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Max elim picks</label>
            <input
              type="number"
              value={maxPicks}
              onChange={(e) => setMaxPicks(e.target.value)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`finale-${episode.id}`}
              checked={isFinale}
              onChange={(e) => setIsFinale(e.target.checked)}
            />
            <label htmlFor={`finale-${episode.id}`} className="text-sm text-gray-700">
              Finale episode
            </label>
          </div>
        </div>
        <ErrorMsg msg={editError} />
        <div className="mt-3">
          <ActionBtn onClick={saveEpisode} disabled={editSaving}>
            {editSaving ? 'Saving…' : 'Save episode'}
          </ActionBtn>
        </div>
      </div>

      {/* Eliminations */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-3">Eliminations</p>
        {!elimLoaded ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <div className="space-y-2">
            {contestants.map((c) => {
              const isSelected = selectedElimIds.has(c.id)
              const draft = elimDrafts.find((e) => e.contestant_id === c.id)
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleElim(c.id)}
                    id={`elim-${episode.id}-${c.id}`}
                  />
                  <label
                    htmlFor={`elim-${episode.id}-${c.id}`}
                    className="text-sm text-gray-700 flex-1"
                  >
                    {c.name}
                  </label>
                  {isSelected && draft && (
                    <select
                      value={draft.elimination_type}
                      onChange={(e) => setElimType(c.id, e.target.value)}
                      className="border border-gray-200 rounded px-2 py-1 text-xs"
                    >
                      {ELIMINATION_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <ErrorMsg msg={elimError} />
        <SuccessMsg msg={elimSuccess} />
        <div className="mt-3">
          <ActionBtn onClick={saveEliminations} disabled={elimSaving || !elimLoaded}>
            {elimSaving ? 'Saving…' : 'Save eliminations'}
          </ActionBtn>
        </div>
      </div>

      {/* Scoring events */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-3">Scoring Events</p>
        {!eventsLoaded ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <>
            {eventDrafts.length > 0 && (
              <div className="space-y-1 mb-3">
                {eventDrafts.map((ev) => (
                  <div
                    key={ev.key}
                    className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded px-3 py-1.5"
                  >
                    <span className="flex-1">
                      {contestantMap.get(ev.contestant_id)?.name ?? '?'} —{' '}
                      {SCORING_EVENT_TYPES.find((t) => t.value === ev.event_type)?.label ??
                        ev.event_type}
                      {ev.quantity !== 1 && ` ×${ev.quantity}`}
                    </span>
                    <button
                      onClick={() => removeEventDraft(ev.key)}
                      className="text-gray-400 hover:text-red-500 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 mb-3">
              <select
                value={newContestant}
                onChange={(e) => setNewContestant(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-sm flex-1 min-w-0"
              >
                <option value="">Contestant…</option>
                {contestants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={newEventType}
                onChange={(e) => setNewEventType(e.target.value)}
                className="border border-gray-200 rounded px-2 py-1 text-sm flex-1 min-w-0"
              >
                {SCORING_EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={newQty}
                onChange={(e) => setNewQty(Number(e.target.value))}
                min={1}
                className="w-16 border border-gray-200 rounded px-2 py-1 text-sm"
              />
              <ActionBtn variant="secondary" onClick={addEventDraft} disabled={!newContestant}>
                + Add
              </ActionBtn>
            </div>
          </>
        )}
        <ErrorMsg msg={eventsError} />
        <SuccessMsg msg={eventsSuccess} />
        <ActionBtn onClick={saveScoringEvents} disabled={eventsSaving || !eventsLoaded}>
          {eventsSaving ? 'Saving…' : 'Save scoring events'}
        </ActionBtn>
      </div>

      {/* Score episode */}
      <div className="pt-4 border-t border-gray-100">
        {episode.status === 'scored' ? (
          <p className="text-xs text-gray-500">
            Episode scored. Scores compute live — re-saving eliminations or scoring events
            updates standings automatically.
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-2">
              Marks the episode complete. Scores compute live from eliminations + scoring
              events, so they can still be corrected afterwards.
            </p>
            <ErrorMsg msg={scoreError} />
            <SuccessMsg msg={scoreSuccess} />
            <ActionBtn onClick={scoreEpisode} disabled={scoring}>
              {scoring ? 'Scoring…' : 'Score episode'}
            </ActionBtn>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Episodes section ─────────────────────────────────────────────────────────

function EpisodesSection({
  season,
  episodes,
  contestants,
  onUpdated,
}: {
  season: Season
  episodes: Episode[]
  contestants: Contestant[]
  onUpdated: (eps: Episode[]) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [epNum, setEpNum] = useState('')
  const [airDate, setAirDate] = useState('')
  const [locksAt, setLocksAt] = useState('')
  const [maxPicks, setMaxPicks] = useState('3')
  const [isFinale, setIsFinale] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function addEpisode() {
    setAdding(true)
    setAddError(null)
    try {
      const ep = await api.post<Episode>(`/seasons/${season.id}/episodes`, {
        episode_number: Number(epNum),
        air_date: airDate,
        picks_lock_at: centralLocalToUtc(locksAt),
        max_elimination_picks: Number(maxPicks),
        is_finale: isFinale,
      })
      onUpdated([...episodes, ep].sort((a, b) => a.episode_number - b.episode_number))
      setShowAddForm(false)
      setEpNum('')
      setAirDate('')
      setLocksAt('')
      setMaxPicks('3')
      setIsFinale(false)
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Add failed')
    } finally {
      setAdding(false)
    }
  }

  function handleEpisodeUpdated(updated: Episode) {
    onUpdated(
      episodes
        .map((ep) => (ep.id === updated.id ? updated : ep))
        .sort((a, b) => a.episode_number - b.episode_number),
    )
  }

  const statusBadge = (status: string) => {
    const cls =
      status === 'scored'
        ? 'bg-green-50 text-green-700'
        : status === 'upcoming'
          ? 'bg-blue-50 text-blue-700'
          : 'bg-gray-100 text-gray-500'
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{status}</span>
    )
  }

  return (
    <div className="space-y-2">
      {episodes.map((ep) => (
        <div key={ep.id} className="p-4 bg-white border border-gray-200 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-medium text-gray-900">Ep {ep.episode_number}</span>
              {ep.is_finale && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                  finale
                </span>
              )}
              {statusBadge(ep.status)}
              <span className="text-xs text-gray-400">{ep.air_date}</span>
            </div>
            <ActionBtn
              variant="secondary"
              onClick={() => setExpandedId((id) => (id === ep.id ? null : ep.id))}
            >
              {expandedId === ep.id ? 'Collapse' : 'Manage'}
            </ActionBtn>
          </div>
          {expandedId === ep.id && (
            <EpisodePanel
              episode={ep}
              contestants={contestants}
              onUpdated={handleEpisodeUpdated}
            />
          )}
        </div>
      ))}

      {showAddForm ? (
        <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
          <p className="text-xs font-semibold text-gray-500">Add Episode</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Episode #</label>
              <input
                type="number"
                value={epNum}
                onChange={(e) => setEpNum(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Air date</label>
              <input
                type="date"
                value={airDate}
                onChange={(e) => setAirDate(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Picks lock at (CT)</label>
              <input
                type="datetime-local"
                value={locksAt}
                onChange={(e) => setLocksAt(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Max elim picks</label>
              <input
                type="number"
                value={maxPicks}
                onChange={(e) => setMaxPicks(e.target.value)}
                className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="new-ep-finale"
                checked={isFinale}
                onChange={(e) => setIsFinale(e.target.checked)}
              />
              <label htmlFor="new-ep-finale" className="text-sm text-gray-700">
                Finale episode
              </label>
            </div>
          </div>
          <ErrorMsg msg={addError} />
          <div className="flex gap-2">
            <ActionBtn onClick={addEpisode} disabled={adding || !epNum || !airDate || !locksAt}>
              {adding ? 'Adding…' : 'Add episode'}
            </ActionBtn>
            <ActionBtn variant="secondary" onClick={() => setShowAddForm(false)}>
              Cancel
            </ActionBtn>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-2 text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl hover:border-gray-300 hover:text-gray-700 transition-colors"
        >
          + Add episode
        </button>
      )}
    </div>
  )
}

// ─── Tokens section ───────────────────────────────────────────────────────────

function TokensSection({ season, episodes }: { season: Season; episodes: Episode[] }) {
  const [startAmount, setStartAmount] = useState('10')
  const [startSaving, setStartSaving] = useState(false)
  const [startMsg, setStartMsg] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  const [weeklyEp, setWeeklyEp] = useState('')
  const [weeklyAmount, setWeeklyAmount] = useState('5')
  const [weeklySaving, setWeeklySaving] = useState(false)
  const [weeklyMsg, setWeeklyMsg] = useState<string | null>(null)
  const [weeklyError, setWeeklyError] = useState<string | null>(null)

  async function grantStarting() {
    setStartSaving(true)
    setStartMsg(null)
    setStartError(null)
    try {
      const rows = await api.post<unknown[]>(
        `/seasons/${season.id}/tokens/starting-allocation`,
        { amount: Number(startAmount) },
      )
      setStartMsg(`Granted to ${rows.length} player(s).`)
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setStartSaving(false)
    }
  }

  async function grantWeekly() {
    setWeeklySaving(true)
    setWeeklyMsg(null)
    setWeeklyError(null)
    try {
      const rows = await api.post<unknown[]>(
        `/seasons/${season.id}/tokens/weekly-allocation`,
        { episode_id: weeklyEp, amount: Number(weeklyAmount) },
      )
      setWeeklyMsg(`Granted to ${rows.length} player(s).`)
    } catch (e) {
      setWeeklyError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setWeeklySaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
        <p className="text-sm font-medium text-gray-700">Starting allocation (all players)</p>
        <p className="text-xs text-gray-500">Idempotent — skips players who already received one.</p>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            value={startAmount}
            onChange={(e) => setStartAmount(e.target.value)}
            className="w-20 border border-gray-200 rounded px-2 py-1 text-sm"
          />
          <span className="text-sm text-gray-500">tokens</span>
        </div>
        <ErrorMsg msg={startError} />
        <SuccessMsg msg={startMsg} />
        <ActionBtn onClick={grantStarting} disabled={startSaving}>
          {startSaving ? 'Granting…' : 'Grant'}
        </ActionBtn>
      </div>

      <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
        <p className="text-sm font-medium text-gray-700">Weekly allocation</p>
        <p className="text-xs text-gray-500">Idempotent — skips players who already received one for this episode.</p>
        <div className="space-y-2">
          <select
            value={weeklyEp}
            onChange={(e) => setWeeklyEp(e.target.value)}
            className="w-full border border-gray-200 rounded px-2 py-1 text-sm"
          >
            <option value="">Episode…</option>
            {episodes.map((ep) => (
              <option key={ep.id} value={ep.id}>
                Ep {ep.episode_number}
              </option>
            ))}
          </select>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={weeklyAmount}
              onChange={(e) => setWeeklyAmount(e.target.value)}
              className="w-20 border border-gray-200 rounded px-2 py-1 text-sm"
            />
            <span className="text-sm text-gray-500">tokens</span>
          </div>
        </div>
        <ErrorMsg msg={weeklyError} />
        <SuccessMsg msg={weeklyMsg} />
        <ActionBtn onClick={grantWeekly} disabled={weeklySaving || !weeklyEp}>
          {weeklySaving ? 'Granting…' : 'Grant'}
        </ActionBtn>
      </div>
    </div>
  )
}

// ─── Admin page ───────────────────────────────────────────────────────────────

export function AdminPage() {
  const { profile } = useAuth()
  const [season, setSeason] = useState<Season | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const seasons = await api.get<Season[]>('/seasons')
        const active = seasons.find((s) => s.status === 'active') ?? seasons.at(-1)
        if (!active) return
        setSeason(active)
        const [cs, eps] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
        ])
        setContestants(cs)
        setEpisodes(eps.sort((a, b) => a.episode_number - b.episode_number))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (loading) return <p className="text-gray-500">Loading…</p>
  if (error) return <p className="text-red-600">{error}</p>

  if (!profile?.is_admin) {
    return <p className="text-gray-500">Access denied.</p>
  }

  if (!season) {
    return <p className="text-gray-500">No season found.</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Admin</h1>
      <p className="text-sm text-gray-500 mb-8">{season.name}</p>

      <SectionHeader title="Season" />
      <SeasonSection season={season} onUpdated={setSeason} />

      <SectionHeader title={`Contestants (${contestants.length})`} />
      <ContestantsSection
        seasonId={season.id}
        contestants={contestants}
        onUpdated={setContestants}
      />

      <SectionHeader title="Episodes" />
      <EpisodesSection
        season={season}
        episodes={episodes}
        contestants={contestants}
        onUpdated={setEpisodes}
      />

      <SectionHeader title="Tokens" />
      <TokensSection season={season} episodes={episodes} />
    </div>
  )
}
