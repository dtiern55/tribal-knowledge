import { useEffect, useState } from 'react'
import { api, getActiveSeason } from '../lib/api'
import { ContestantAvatar } from '../components/ContestantAvatar'
import { centralLocalToUtc, utcToCentralLocal } from '../lib/time'
import { useAuth } from '../auth/useAuth'
import type {
  Contestant,
  Episode,
  LeagueSettings,
  ScoringEventType,
  Season,
} from '../types'

const ELIMINATION_TYPES = [
  { value: 'voted_out', label: 'Voted out' },
  { value: 'medical_evacuation', label: 'Medical evacuation' },
  { value: 'quit', label: 'Quit' },
  { value: 'fire_making_loss', label: 'Fire-making loss' },
]

// ─── Shared helpers ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 border-l-2 border-ember-500 pl-2 mb-4 mt-8 first:mt-0">
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

/** Standard async-action wrapper: toggles a busy flag and captures the error. */
async function run(
  setBusy: (b: boolean) => void,
  setError: (msg: string | null) => void,
  fn: () => Promise<void>,
) {
  setBusy(true)
  setError(null)
  try {
    await fn()
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Request failed')
  } finally {
    setBusy(false)
  }
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
      ? 'bg-jungle-600 text-white hover:bg-jungle-700'
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
  const [winnerLockEp, setWinnerLockEp] = useState(String(season.winner_lock_episode ?? ''))
  const [swapCost, setSwapCost] = useState(String(season.swap_token_cost))
  const [status, setStatus] = useState(season.status)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function save() {
    void run(setSaving, setError, async () => {
      const updated = await api.patch<Season>(`/seasons/${season.id}`, {
        name,
        merge_episode: mergeEp ? Number(mergeEp) : null,
        roster_lock_episode: lockEp ? Number(lockEp) : null,
        winner_lock_episode: winnerLockEp ? Number(winnerLockEp) : null,
        swap_token_cost: Number(swapCost),
        status,
      })
      onUpdated(updated)
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div className="p-4 bg-white border border-sand-200 rounded-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-gray-900">{season.name}</p>
            <p className="text-sm text-gray-500 mt-1">
              Season #{season.season_number} · {season.status} · roster locks ep{' '}
              {season.roster_lock_episode ?? '—'} · winner locks ep{' '}
              {season.winner_lock_episode ?? '—'} · merge ep {season.merge_episode ?? '—'} ·
              swaps cost {season.swap_token_cost} tkn
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
    <div className="p-4 bg-white border border-sand-200 rounded-xl space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-sand-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Season['status'])}
            className="w-full border border-sand-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="upcoming">upcoming</option>
            <option value="active">active</option>
            <option value="completed">completed</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Swap cost (tokens)</label>
          <input
            type="number"
            value={swapCost}
            onChange={(e) => setSwapCost(e.target.value)}
            className="w-full border border-sand-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Roster lock episode</label>
          <input
            type="number"
            value={lockEp}
            onChange={(e) => setLockEp(e.target.value)}
            className="w-full border border-sand-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Winner lock episode</label>
          <input
            type="number"
            value={winnerLockEp}
            onChange={(e) => setWinnerLockEp(e.target.value)}
            className="w-full border border-sand-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Merge episode</label>
          <input
            type="number"
            value={mergeEp}
            onChange={(e) => setMergeEp(e.target.value)}
            className="w-full border border-sand-200 rounded-lg px-3 py-2 text-sm"
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
  const [editImageUrl, setEditImageUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  function startEdit(c: Contestant) {
    setEditingId(c.id)
    setEditName(c.name)
    setEditPlacement(c.placement != null ? String(c.placement) : '')
    setEditImageUrl(c.image_url ?? '')
    setEditError(null)
  }

  function saveEdit(id: string) {
    void run(setSaving, setEditError, async () => {
      const updated = await api.patch<Contestant>(`/contestants/${id}`, {
        name: editName,
        placement: editPlacement ? Number(editPlacement) : null,
        image_url: editImageUrl.trim() || null,
      })
      onUpdated(contestants.map((c) => (c.id === id ? updated : c)))
      setEditingId(null)
    })
  }

  function addContestants() {
    const names = addText
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean)
    if (!names.length) return
    void run(setAdding, setAddError, async () => {
      const added = await api.post<Contestant[]>(`/seasons/${seasonId}/contestants`, { names })
      onUpdated([...contestants, ...added])
      setAddText('')
    })
  }

  return (
    <div className="space-y-2">
      {contestants.map((c) =>
        editingId === c.id ? (
          <div
            key={c.id}
            className="p-3 bg-white border border-ocean-200 rounded-lg space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 border border-sand-200 rounded px-2 py-1 text-sm"
                placeholder="Name"
              />
              <input
                type="number"
                value={editPlacement}
                onChange={(e) => setEditPlacement(e.target.value)}
                className="w-20 border border-sand-200 rounded px-2 py-1 text-sm"
                placeholder="Place"
              />
              <ActionBtn onClick={() => saveEdit(c.id)} disabled={saving}>
                {saving ? '…' : 'Save'}
              </ActionBtn>
              <ActionBtn variant="secondary" onClick={() => setEditingId(null)}>
                ✕
              </ActionBtn>
            </div>
            <div className="flex items-center gap-2">
              <ContestantAvatar name={editName} imageUrl={editImageUrl.trim() || null} />
              <input
                value={editImageUrl}
                onChange={(e) => setEditImageUrl(e.target.value)}
                className="flex-1 border border-sand-200 rounded px-2 py-1 text-sm"
                placeholder="Photo URL (upload in Supabase Studio, paste the public link)"
              />
            </div>
            <ErrorMsg msg={editError} />
          </div>
        ) : (
          <div
            key={c.id}
            className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg"
          >
            <span className="flex items-center gap-2 text-sm text-gray-900">
              <ContestantAvatar name={c.name} imageUrl={c.image_url} size="sm" />
              {c.name}
              {c.placement != null && (
                <span className="text-xs text-gray-400">#{c.placement}</span>
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
          className="w-full border border-sand-200 rounded-lg px-3 py-2 text-sm mb-2"
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

interface ScoringEventRow {
  id: string
  contestant_id: string
  event_type: string
  quantity: number
}

interface EliminationRow {
  id: string
  contestant_id: string
  elimination_type: string
}

function EpisodePanel({
  episode,
  contestants,
  eventTypes,
  onUpdated,
}: {
  episode: Episode
  contestants: Contestant[]
  eventTypes: ScoringEventType[]
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

  // Eliminations — live: each add/remove persists immediately (issue #71)
  const [elims, setElims] = useState<EliminationRow[]>([])
  const [elimLoaded, setElimLoaded] = useState(false)
  const [elimBusy, setElimBusy] = useState<string | null>(null)
  const [elimError, setElimError] = useState<string | null>(null)

  // Scoring events — live: each add/remove persists immediately (issue #71)
  const [events, setEvents] = useState<ScoringEventRow[]>([])
  const [eventsLoaded, setEventsLoaded] = useState(false)
  const [newContestant, setNewContestant] = useState('')
  const [newEventType, setNewEventType] = useState(eventTypes[0]?.event_type ?? '')
  const [newQty, setNewQty] = useState(1)
  const [eventsBusy, setEventsBusy] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)

  // Score episode
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const [scoreSuccess, setScoreSuccess] = useState<string | null>(null)

  useEffect(() => {
    // Load eliminations and scoring events when panel opens
    async function loadData() {
      const [elimRows, eventRows] = await Promise.all([
        api.get<EliminationRow[]>(`/episodes/${episode.id}/eliminations`).catch(() => []),
        api.get<ScoringEventRow[]>(`/episodes/${episode.id}/scoring-events`).catch(() => []),
      ])
      setElims(elimRows)
      setElimLoaded(true)
      setEvents(eventRows)
      setEventsLoaded(true)
    }
    void loadData()
  }, [episode.id])

  function saveEpisode() {
    void run(setEditSaving, setEditError, async () => {
      const updated = await api.patch<Episode>(`/episodes/${episode.id}`, {
        episode_number: Number(epNum),
        air_date: airDate,
        picks_lock_at: centralLocalToUtc(locksAt),
        max_elimination_picks: Number(maxPicks),
        is_finale: isFinale,
      })
      onUpdated(updated)
    })
  }

  function toggleElim(contestantId: string) {
    const existing = elims.find((e) => e.contestant_id === contestantId)
    setElimBusy(contestantId)
    void run(
      (b) => setElimBusy(b ? contestantId : null),
      setElimError,
      async () => {
        if (existing) {
          await api.delete(`/eliminations/${existing.id}`)
          setElims((prev) => prev.filter((e) => e.id !== existing.id))
        } else {
          const [row] = await api.post<EliminationRow[]>(
            `/episodes/${episode.id}/eliminations`,
            [{ contestant_id: contestantId, elimination_type: 'voted_out' }],
          )
          setElims((prev) => [...prev, row])
        }
      },
    )
  }

  function setElimType(contestantId: string, type: string) {
    const existing = elims.find((e) => e.contestant_id === contestantId)
    if (!existing) return
    setElimBusy(contestantId)
    // No PATCH endpoint — replace the row (delete + re-add with the new type)
    void run(
      (b) => setElimBusy(b ? contestantId : null),
      setElimError,
      async () => {
        await api.delete(`/eliminations/${existing.id}`)
        const [row] = await api.post<EliminationRow[]>(
          `/episodes/${episode.id}/eliminations`,
          [{ contestant_id: contestantId, elimination_type: type }],
        )
        setElims((prev) => prev.map((e) => (e.id === existing.id ? row : e)))
      },
    )
  }

  function addEvent() {
    if (!newContestant) return
    void run(setEventsBusy, setEventsError, async () => {
      const [row] = await api.post<ScoringEventRow[]>(
        `/episodes/${episode.id}/scoring-events`,
        [{ contestant_id: newContestant, event_type: newEventType, quantity: newQty }],
      )
      setEvents((prev) => [...prev, row])
      setNewQty(1)
    })
  }

  function removeEvent(id: string) {
    void run(setEventsBusy, setEventsError, async () => {
      await api.delete(`/scoring-events/${id}`)
      setEvents((prev) => prev.filter((e) => e.id !== id))
    })
  }

  function scoreEpisode() {
    setScoreSuccess(null)
    void run(setScoring, setScoreError, async () => {
      const updated = await api.post<Episode>(`/episodes/${episode.id}/score`, {})
      onUpdated(updated)
      setScoreSuccess('Episode scored.')
    })
  }

  const contestantMap = new Map(contestants.map((c) => [c.id, c]))
  const selectedElimIds = new Set(elims.map((e) => e.contestant_id))

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
              className="w-full border border-sand-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Air date</label>
            <input
              type="date"
              value={airDate}
              onChange={(e) => setAirDate(e.target.value)}
              className="w-full border border-sand-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Picks lock at (CT)</label>
            <input
              type="datetime-local"
              value={locksAt}
              onChange={(e) => setLocksAt(e.target.value)}
              className="w-full border border-sand-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Max elim picks</label>
            <input
              type="number"
              value={maxPicks}
              onChange={(e) => setMaxPicks(e.target.value)}
              className="w-full border border-sand-200 rounded px-2 py-1 text-sm"
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
              const draft = elims.find((e) => e.contestant_id === c.id)
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={elimBusy === c.id}
                    onChange={() => toggleElim(c.id)}
                    id={`elim-${episode.id}-${c.id}`}
                  />
                  <label
                    htmlFor={`elim-${episode.id}-${c.id}`}
                    className="text-sm text-gray-700 flex-1 flex items-center gap-2"
                  >
                    <ContestantAvatar name={c.name} imageUrl={c.image_url} size="sm" />
                    {c.name}
                  </label>
                  {isSelected && draft && (
                    <select
                      value={draft.elimination_type}
                      disabled={elimBusy === c.id}
                      onChange={(e) => setElimType(c.id, e.target.value)}
                      className="border border-sand-200 rounded px-2 py-1 text-xs"
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
        <p className="text-xs text-gray-400 mt-2">Changes save automatically.</p>
      </div>

      {/* Scoring events */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-3">Scoring Events</p>
        {!eventsLoaded ? (
          <p className="text-xs text-gray-400">Loading…</p>
        ) : (
          <>
            {events.length > 0 && (
              <div className="space-y-1 mb-3">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded px-3 py-1.5"
                  >
                    <span className="flex-1">
                      {contestantMap.get(ev.contestant_id)?.name ?? '?'} —{' '}
                      {eventTypes.find((t) => t.event_type === ev.event_type)?.label ??
                        ev.event_type}
                      {ev.quantity !== 1 && ` ×${ev.quantity}`}
                    </span>
                    <button
                      onClick={() => removeEvent(ev.id)}
                      disabled={eventsBusy}
                      className="text-gray-400 hover:text-red-500 text-xs disabled:opacity-40"
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
                className="border border-sand-200 rounded px-2 py-1 text-sm flex-1 min-w-0"
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
                className="border border-sand-200 rounded px-2 py-1 text-sm flex-1 min-w-0"
              >
                {eventTypes.map((t) => (
                  <option key={t.event_type} value={t.event_type}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={newQty}
                onChange={(e) => setNewQty(Number(e.target.value))}
                min={1}
                className="w-16 border border-sand-200 rounded px-2 py-1 text-sm"
              />
              <ActionBtn
                variant="secondary"
                onClick={addEvent}
                disabled={!newContestant || eventsBusy}
              >
                {eventsBusy ? 'Saving…' : '+ Add'}
              </ActionBtn>
            </div>
          </>
        )}
        <ErrorMsg msg={eventsError} />
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
              Marks the episode complete and grants every player the weekly token
              allocation. Scores compute live from eliminations + scoring events,
              so they can still be corrected afterwards.
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
  eventTypes,
  onUpdated,
}: {
  season: Season
  episodes: Episode[]
  contestants: Contestant[]
  eventTypes: ScoringEventType[]
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

  function addEpisode() {
    void run(setAdding, setAddError, async () => {
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
    })
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
        <div key={ep.id} className="p-4 bg-white border border-sand-200 rounded-xl">
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
              eventTypes={eventTypes}
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
                className="w-full border border-sand-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Air date</label>
              <input
                type="date"
                value={airDate}
                onChange={(e) => setAirDate(e.target.value)}
                className="w-full border border-sand-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Picks lock at (CT)</label>
              <input
                type="datetime-local"
                value={locksAt}
                onChange={(e) => setLocksAt(e.target.value)}
                className="w-full border border-sand-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Max elim picks</label>
              <input
                type="number"
                value={maxPicks}
                onChange={(e) => setMaxPicks(e.target.value)}
                className="w-full border border-sand-200 rounded px-2 py-1 text-sm"
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
          className="w-full py-2 text-sm text-gray-500 border border-dashed border-sand-200 rounded-xl hover:border-gray-300 hover:text-gray-700 transition-colors"
        >
          + Add episode
        </button>
      )}
    </div>
  )
}

// ─── Tokens section ───────────────────────────────────────────────────────────

function TokensSection({ season }: { season: Season }) {
  // Starting allocations are gone with the #97 token model (grants are per
  // upcoming episode); the season-start bootstrap is a weekly grant too.
  return (
    <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-2">
      <p className="text-sm font-medium text-gray-700">Weekly allocation</p>
      <p className="text-xs text-gray-500">
        Granted automatically when an episode is scored:{' '}
        {season.weekly_token_allocation} tokens per player. Tune it on the
        season (weekly_token_allocation).
      </p>
    </div>
  )
}

// ─── League settings section ───────────────────────────────────────────────────

function LeagueSettingsSection({
  settings,
  onUpdated,
}: {
  settings: LeagueSettings
  onUpdated: (s: LeagueSettings) => void
}) {
  const [joinCode, setJoinCode] = useState(settings.join_code)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function save() {
    setSuccess(null)
    void run(setSaving, setError, async () => {
      const updated = await api.patch<LeagueSettings>('/league-settings', {
        join_code: joinCode,
      })
      onUpdated(updated)
      setSuccess('Join code updated.')
    })
  }

  return (
    <div className="p-4 bg-white border border-sand-200 rounded-xl space-y-3 max-w-sm">
      <p className="text-xs text-gray-500">
        Share this code with new members — they enter it at /join to create their
        profile.
      </p>
      <input
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value)}
        className="w-full border border-sand-200 rounded-lg px-3 py-2 text-sm"
      />
      <ErrorMsg msg={error} />
      <SuccessMsg msg={success} />
      <ActionBtn onClick={save} disabled={saving || !joinCode.trim()}>
        {saving ? 'Saving…' : 'Save'}
      </ActionBtn>
    </div>
  )
}

// ─── Admin page ───────────────────────────────────────────────────────────────

export function AdminPage() {
  const { profile } = useAuth()
  const [season, setSeason] = useState<Season | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [eventTypes, setEventTypes] = useState<ScoringEventType[]>([])
  const [leagueSettings, setLeagueSettings] = useState<LeagueSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const active = await getActiveSeason()
        if (!active) return
        setSeason(active)
        const [cs, eps, types, settings] = await Promise.all([
          api.get<Contestant[]>(`/seasons/${active.id}/contestants`),
          api.get<Episode[]>(`/seasons/${active.id}/episodes`),
          api.get<ScoringEventType[]>('/scoring-event-types'),
          api.get<LeagueSettings>('/league-settings'),
        ])
        setContestants(cs)
        setEpisodes(eps.sort((a, b) => a.episode_number - b.episode_number))
        setEventTypes(types)
        setLeagueSettings(settings)
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
      <h1 className="font-display text-2xl md:text-3xl tracking-wide text-ocean-800 mb-1">Admin</h1>
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
        eventTypes={eventTypes}
        onUpdated={setEpisodes}
      />

      <SectionHeader title="Tokens" />
      <TokensSection season={season} />

      {leagueSettings && (
        <>
          <SectionHeader title="League Settings" />
          <LeagueSettingsSection settings={leagueSettings} onUpdated={setLeagueSettings} />
        </>
      )}
    </div>
  )
}
