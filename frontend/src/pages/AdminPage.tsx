import { useCallback, useEffect, useState } from 'react'
import { LOADER_DELAY_MS, PageLoader } from '../components/PageLoader'
import { SlidePuzzleLoader } from '../components/SlidePuzzleLoader'
import { Notice } from '../components/Notice'
import { PageHeader } from '../components/PageHeader'
import { api, getActiveSeason } from '../lib/api'
import { commissionerContext, commissionerEpisodeLabel } from '../lib/adminWorkflow'
import { displayName } from '../lib/cast'
import { ContestantAvatar } from '../components/ContestantAvatar'
import { centralLocalToUtc, utcToCentralLocal } from '../lib/time'
import { useAuth } from '../auth/useAuth'
import type {
  Contestant,
  Episode,
  EpisodeInsightConfig,
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

// Collapsible top-level section (#519). Keeps the anchor id the workflow nav
// jumps to and the description, and remembers open/closed per section so a
// commissioner can fold away setup mid-season and land back on Episodes.
function Section({
  id,
  title,
  description,
  defaultOpen = true,
  children,
}: {
  id: string
  title: string
  description?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const storageKey = `mytribe.admin-section.${id}`
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(storageKey)
    return saved == null ? defaultOpen : saved === '1'
  })
  function toggle() {
    setOpen((o) => {
      localStorage.setItem(storageKey, o ? '0' : '1')
      return !o
    })
  }
  return (
    <section id={id} className="scroll-mt-24 mt-10 first:mt-0">
      {/* button inside h2 so sections sit under the page h1 and don't skip a level */}
      <h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex w-full items-start gap-2 border-l-4 border-terracotta-500 pl-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl tracking-wide text-forest-900">{title}</span>
            {description && <span className="mt-1 block text-sm text-gray-500">{description}</span>}
          </span>
          <svg
            viewBox="0 0 24 24"
            className={`mt-1 h-5 w-5 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </h2>
      {open && <div className="mt-4">{children}</div>}
    </section>
  )
}

function ConfirmAction({
  label,
  confirmLabel,
  impact,
  onConfirm,
  busy,
}: {
  label: string
  confirmLabel: string
  impact: string
  onConfirm: () => void
  busy?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  if (!confirming) return <ActionBtn onClick={() => setConfirming(true)} disabled={busy}>{label}</ActionBtn>
  return (
    <div className="rounded-xl border border-gold-300 bg-gold-50 p-3" role="alert">
      <p className="text-sm font-medium text-gold-900">{impact}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <ActionBtn onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</ActionBtn>
        <ActionBtn variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>Cancel</ActionBtn>
      </div>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p className="text-terracotta-600 text-sm mt-2">{msg}</p>
}

function SuccessMsg({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p className="text-jade-600 text-sm mt-2">{msg}</p>
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
      ? 'bg-jade-600 text-white hover:bg-jade-700'
      : variant === 'danger'
        ? 'bg-terracotta-600 text-white hover:bg-terracotta-700'
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
  const [swapCost, setSwapCost] = useState(String(season.swap_token_cost))
  const [status, setStatus] = useState(season.status)
  // Edited as strings so a row can be half-typed; empty rows drop on save.
  const [schedule, setSchedule] = useState(
    season.elimination_pick_schedule.map((t) => ({
      from_episode: String(t.from_episode),
      picks: String(t.picks),
    })),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setTier(i: number, field: 'from_episode' | 'picks', value: string) {
    setSchedule(schedule.map((t, j) => (j === i ? { ...t, [field]: value } : t)))
  }

  function save() {
    void run(setSaving, setError, async () => {
      const updated = await api.patch<Season>(`/seasons/${season.id}`, {
        name,
        merge_episode: mergeEp ? Number(mergeEp) : null,
        roster_lock_episode: lockEp ? Number(lockEp) : null,
        ...(season.token_economy_enabled
          ? { swap_token_cost: Number(swapCost) }
          : {}),
        elimination_pick_schedule: schedule
          .filter((t) => t.from_episode && t.picks)
          .map((t) => ({ from_episode: Number(t.from_episode), picks: Number(t.picks) }))
          .sort((a, b) => a.from_episode - b.from_episode),
        status,
      })
      onUpdated(updated)
      setEditing(false)
    })
  }

  if (!editing) {
    return (
      <div className="p-4 bg-white border border-cream-200 rounded-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-gray-900">{season.name}</p>
            <p className="text-sm text-gray-500 mt-1">
              Season #{season.season_number} · {season.status} · roster locks ep{' '}
              {season.roster_lock_episode ?? '—'} · merge ep {season.merge_episode ?? '—'} ·{' '}
              {season.token_economy_enabled
                ? `swaps cost ${season.swap_token_cost} tkn`
                : `${season.free_swaps} free ${season.free_swaps === 1 ? 'swap' : 'swaps'}; then ${season.swap_penalty_step}/swap escalating, floor ${season.swap_penalty_floor}`}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Votes:{' '}
              {season.elimination_pick_schedule.length
                ? season.elimination_pick_schedule
                    .map((t) => `ep ${t.from_episode}+ → ${t.picks}`)
                    .join(' · ')
                : 'no schedule (3 unless set per episode)'}
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
    <div className="p-4 bg-white border border-cream-200 rounded-xl space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Season['status'])}
            className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="upcoming">upcoming</option>
            <option value="active">active</option>
            <option value="completed">completed</option>
          </select>
        </div>
        {season.token_economy_enabled && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Legacy swap cost (tokens)</label>
            <input
              type="number"
              value={swapCost}
              onChange={(e) => setSwapCost(e.target.value)}
              className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Roster lock episode</label>
          <input
            type="number"
            value={lockEp}
            onChange={(e) => setLockEp(e.target.value)}
            className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Merge episode</label>
          <input
            type="number"
            value={mergeEp}
            onChange={(e) => setMergeEp(e.target.value)}
            className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">
            Ballot vote schedule — new episodes take the last tier at or below
            their number
          </label>
          <div className="space-y-1">
            {schedule.map((tier, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-500">From ep</span>
                <input
                  type="number"
                  min={1}
                  value={tier.from_episode}
                  onChange={(e) => setTier(i, 'from_episode', e.target.value)}
                  className="w-20 border border-cream-200 rounded-lg px-2 py-1 text-sm"
                />
                <span className="text-xs text-gray-500">votes</span>
                <input
                  type="number"
                  min={1}
                  max={3}
                  value={tier.picks}
                  onChange={(e) => setTier(i, 'picks', e.target.value)}
                  className="w-20 border border-cream-200 rounded-lg px-2 py-1 text-sm"
                />
                <ActionBtn
                  variant="secondary"
                  onClick={() => setSchedule(schedule.filter((_, j) => j !== i))}
                >
                  Remove
                </ActionBtn>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <ActionBtn
              variant="secondary"
              onClick={() => setSchedule([...schedule, { from_episode: '', picks: '' }])}
            >
              Add tier
            </ActionBtn>
          </div>
        </div>
      </div>
      <ErrorMsg msg={error} />
      <div className="flex gap-2">
        {status === 'completed' && season.status !== 'completed' ? (
          <ConfirmAction
            label="Review season completion"
            confirmLabel="Complete season"
            impact="Completing the season changes mterracotta-facing composition to final standings. Existing scores and historical rules remain unchanged."
            onConfirm={save}
            busy={saving}
          />
        ) : (
          <ActionBtn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</ActionBtn>
        )}
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
  const [editNickname, setEditNickname] = useState('')
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
    setEditNickname(c.nickname ?? '')
    setEditPlacement(c.placement != null ? String(c.placement) : '')
    setEditImageUrl(c.image_url ?? '')
    setEditError(null)
  }

  function saveEdit(id: string) {
    void run(setSaving, setEditError, async () => {
      const updated = await api.patch<Contestant>(`/contestants/${id}`, {
        name: editName,
        nickname: editNickname.trim(),
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
            className="p-3 bg-white border border-forest-200 rounded-lg space-y-2"
          >
            <div className="flex items-center gap-2">
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="flex-1 border border-cream-200 rounded px-2 py-1 text-sm"
                placeholder="Name"
              />
              <input
                type="number"
                value={editPlacement}
                onChange={(e) => setEditPlacement(e.target.value)}
                className="w-20 border border-cream-200 rounded px-2 py-1 text-sm"
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
              <input
                value={editNickname}
                onChange={(e) => setEditNickname(e.target.value)}
                className="flex-1 border border-cream-200 rounded px-2 py-1 text-sm"
                placeholder="Nickname (shown everywhere instead of Name — leave blank to clear)"
              />
            </div>
            <div className="flex items-center gap-2">
              <ContestantAvatar name={editName} imageUrl={editImageUrl.trim() || null} />
              <input
                value={editImageUrl}
                onChange={(e) => setEditImageUrl(e.target.value)}
                className="flex-1 border border-cream-200 rounded px-2 py-1 text-sm"
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
              <ContestantAvatar name={displayName(c)} imageUrl={c.image_url} size="sm" />
              {displayName(c)}
              {c.placement != null && (
                <span className="text-xs text-gray-500">#{c.placement}</span>
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
          className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm mb-2"
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

// Review-gated survivoR import (#132)
interface ImportProposal {
  eliminations: { contestant_id: string; name: string; elimination_type: string; result: string }[]
  events: { contestant_id: string; name: string; event_type: string; quantity: number }[]
  placements: { contestant_id: string; name: string; placement: number }[]
  warnings: string[]
  unmatched: string[]
  source: string
}

/** Review-gated survivoR import (#132): load the server's proposal, uncheck
 * anything wrong, apply through the normal additive endpoints. */
function ImportSection({
  episode,
  contestants,
  eventTypes,
  elims,
  events,
  onApplied,
}: {
  episode: Episode
  contestants: Contestant[]
  eventTypes: ScoringEventType[]
  elims: EliminationRow[]
  events: ScoringEventRow[]
  onApplied: (added: { elims: EliminationRow[]; events: ScoringEventRow[] }) => void
}) {
  const [sourceSeason, setSourceSeason] = useState('')
  const [proposal, setProposal] = useState<ImportProposal | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const elimDone = new Set(elims.map((e) => e.contestant_id))
  const eventDone = new Set(events.map((e) => `${e.contestant_id}:${e.event_type}`))
  const placementOf = new Map(contestants.map((c) => [c.id, c.placement]))
  const eventLabel = (t: string) =>
    eventTypes.find((e) => e.event_type === t)?.label ?? t

  function load() {
    setSuccess(null)
    void run(setLoading, setError, async () => {
      const q = sourceSeason ? `?source_season=${sourceSeason}` : ''
      const p = await api.get<ImportProposal>(
        `/episodes/${episode.id}/import-proposal${q}`,
      )
      setProposal(p)
      // Anything already recorded defaults unchecked — re-applying it would
      // duplicate (events) or 400 (eliminations).
      const init = new Set<string>()
      p.eliminations.forEach((e, i) => {
        if (!elimDone.has(e.contestant_id)) init.add(`e:${i}`)
      })
      p.events.forEach((ev, i) => {
        if (!eventDone.has(`${ev.contestant_id}:${ev.event_type}`)) init.add(`v:${i}`)
      })
      p.placements.forEach((pl, i) => {
        if (placementOf.get(pl.contestant_id) !== pl.placement) init.add(`p:${i}`)
      })
      setChecked(init)
    })
  }

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function apply() {
    if (!proposal) return
    void run(setApplying, setError, async () => {
      const els = proposal.eliminations.filter((_, i) => checked.has(`e:${i}`))
      const evs = proposal.events.filter((_, i) => checked.has(`v:${i}`))
      const pls = proposal.placements.filter((_, i) => checked.has(`p:${i}`))
      const addedElims = els.length
        ? await api.post<EliminationRow[]>(
            `/episodes/${episode.id}/eliminations`,
            els.map((e) => ({
              contestant_id: e.contestant_id,
              elimination_type: e.elimination_type,
            })),
          )
        : []
      const addedEvents = evs.length
        ? await api.post<ScoringEventRow[]>(
            `/episodes/${episode.id}/scoring-events`,
            evs.map((e) => ({
              contestant_id: e.contestant_id,
              event_type: e.event_type,
              quantity: e.quantity,
              notes: `import: ${proposal.source}`,
            })),
          )
        : []
      for (const pl of pls) {
        await api.patch(`/contestants/${pl.contestant_id}`, {
          placement: pl.placement,
        })
      }
      onApplied({ elims: addedElims, events: addedEvents })
      setProposal(null)
      setSuccess(
        `Applied ${addedElims.length} eliminations, ${addedEvents.length} events, ${pls.length} placements.`,
      )
    })
  }

  const row = (key: string, label: string, done: boolean) => (
    <label key={key} className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked.has(key)} onChange={() => toggle(key)} />
      <span className={done ? 'text-gray-500' : 'text-gray-700'}>
        {label}
        {done && ' · already recorded'}
      </span>
    </label>
  )

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-3">Import from survivoR</p>
      {!proposal ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            placeholder="US season # (default: this season)"
            value={sourceSeason}
            onChange={(e) => setSourceSeason(e.target.value)}
            className="w-64 border border-cream-200 rounded px-2 py-1 text-sm"
          />
          <ActionBtn variant="secondary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Load proposal'}
          </ActionBtn>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            {proposal.source} — review, uncheck anything wrong, then apply.
            Judgment calls stay manual. Data:{' '}
            <a
              href="https://github.com/doehm/survivoR"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              survivoR
            </a>{' '}
            (CC BY).
          </p>
          {proposal.unmatched.length > 0 && (
            <p className="text-xs text-terracotta-600">
              No matching contestant (items dropped): {proposal.unmatched.join('; ')}
            </p>
          )}
          {proposal.eliminations.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Eliminations</p>
              {proposal.eliminations.map((e, i) =>
                row(
                  `e:${i}`,
                  `${e.name} — ${e.elimination_type} (${e.result})`,
                  elimDone.has(e.contestant_id),
                ),
              )}
            </div>
          )}
          {proposal.events.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Scoring events</p>
              {proposal.events.map((ev, i) =>
                row(
                  `v:${i}`,
                  `${ev.name} — ${eventLabel(ev.event_type)}${ev.quantity !== 1 ? ` ×${ev.quantity}` : ''}`,
                  eventDone.has(`${ev.contestant_id}:${ev.event_type}`),
                ),
              )}
            </div>
          )}
          {proposal.placements.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Placements</p>
              {proposal.placements.map((pl, i) =>
                row(
                  `p:${i}`,
                  `${pl.name} — ${pl.placement}`,
                  placementOf.get(pl.contestant_id) === pl.placement,
                ),
              )}
            </div>
          )}
          {proposal.warnings.length > 0 && (
            <div className="p-3 bg-gold-50 border border-gold-100 rounded-lg space-y-1">
              {proposal.warnings.map((w, i) => (
                <p key={i} className="text-xs text-gold-700">
                  ! {w}
                </p>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <ActionBtn onClick={apply} disabled={applying || checked.size === 0}>
              {applying ? 'Applying…' : `Apply ${checked.size} item${checked.size === 1 ? '' : 's'}`}
            </ActionBtn>
            <ActionBtn variant="secondary" onClick={() => setProposal(null)}>
              Cancel
            </ActionBtn>
          </div>
        </div>
      )}
      <ErrorMsg msg={error} />
      <SuccessMsg msg={success} />
    </div>
  )
}

function EpisodeInsightEditor({
  episode,
  contestants,
  eliminations,
}: {
  episode: Episode
  contestants: Contestant[]
  eliminations: EliminationRow[]
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [notes, setNotes] = useState<{ label: string; value: string; detail: string }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const stored = selected.length + notes.length

  useEffect(() => {
    let live = true
    api
      .get<EpisodeInsightConfig[]>(`/episodes/${episode.id}/insights`)
      .then((items) => {
        if (!live) return
        setSelected(
          items
            .filter((item) => item.insight_type !== 'manual_note')
            .map((item) => {
              if (item.insight_type === 'pick_popularity') {
                return `pick:${item.contestant_id ?? ''}`
              }
              if (item.insight_type === 'weekly_play_usage') {
                return `play:${item.advantage_type ?? ''}`
              }
              return item.insight_type
            }),
        )
        setNotes(
          items
            .filter((item) => item.insight_type === 'manual_note')
            .map((item) => ({
              label: item.label ?? '',
              value: item.value ?? '',
              detail: item.detail ?? '',
            })),
        )
        setLoaded(true)
      })
      .catch((cause) => {
        if (!live) return
        setError(cause instanceof Error ? cause.message : 'Could not load insights')
        setLoaded(true)
      })
    return () => {
      live = false
    }
  }, [episode.id])

  const contestantMap = new Map(contestants.map((contestant) => [contestant.id, contestant]))
  const options = [
    ...(!episode.is_finale
      ? eliminations.map((elimination) => ({
          key: `pick:${elimination.contestant_id}`,
          label: `Vote popularity: ${contestantMap.get(elimination.contestant_id)?.name ?? 'Eliminated castaway'}`,
          description: 'Share how many submitted ballots included this castaway.',
        }))
      : []),
    ...(!episode.is_finale
      ? [{
          key: 'multiple_correct_ballots',
          label: 'Multiple correct ballots',
          description: 'Count submitted ballots with at least two correct picks.',
        }]
      : []),
    {
      key: 'performance_vs_median',
      label: 'Player vs league median',
      description: "Compare each player's episode score with the league median.",
    },
    ...[
      ['double_roster_points', 'Double Castaway Points usage'],
      ['double_vote_points', 'Double Ballot Points usage'],
      ['roster_swap', 'Tribe Swap usage'],
    ].map(([type, label]) => ({
      key: `play:${type}`,
      label,
      description: 'Show how many league players used this weekly play.',
    })),
  ]

  function toggle(key: string) {
    setSaved(false)
    setSelected((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key)
      if (stored === 3) return current
      return [...current, key]
    })
  }

  function updateNote(index: number, field: 'label' | 'value' | 'detail', text: string) {
    setSaved(false)
    setNotes((current) =>
      current.map((note, i) => (i === index ? { ...note, [field]: text } : note)),
    )
  }

  function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    const toggles = selected.map((key) => {
      if (key.startsWith('pick:')) {
        return { insight_type: 'pick_popularity', contestant_id: key.slice(5) }
      }
      if (key.startsWith('play:')) {
        return { insight_type: 'weekly_play_usage', advantage_type: key.slice(5) }
      }
      return { insight_type: key }
    })
    const noteEntries = notes
      .filter((note) => note.label.trim() && note.value.trim())
      .map((note) => ({
        insight_type: 'manual_note',
        label: note.label.trim(),
        value: note.value.trim(),
        detail: note.detail.trim() || null,
      }))
    const body = [...toggles, ...noteEntries]
    api
      .put<EpisodeInsightConfig[]>(`/episodes/${episode.id}/insights`, body)
      .then(() => setSaved(true))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not save insights'))
      .finally(() => setSaving(false))
  }

  return (
    <div className="pt-4 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500">Reveal Insights</p>
      <p className="mt-1 text-xs text-gray-500">
        Reveal always leads with the League Call (who caught the boot). Add up to three
        more curated facts or commissioner notes below.
      </p>
      {!loaded ? (
        <p className="mt-3 text-xs text-gray-500">Loading…</p>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {options.map((option) => {
              const checked = selected.includes(option.key)
              return (
                <label key={option.key} className="flex items-start gap-2 rounded-lg border border-cream-200 p-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && stored === 3}
                    onChange={() => toggle(option.key)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-medium text-gray-800">{option.label}</span>
                    <span className="block text-xs text-gray-500">{option.description}</span>
                  </span>
                </label>
              )
            })}
          </div>
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500">Commissioner notes</p>
            {notes.map((note, index) => (
              <div key={index} className="space-y-1.5 rounded-lg border border-cream-200 p-2.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={note.label}
                    onChange={(event) => updateNote(index, 'label', event.target.value)}
                    placeholder="Label (e.g. Blindside)"
                    className="min-w-0 flex-1 rounded border border-cream-200 px-2 py-1 text-sm"
                  />
                  <input
                    type="text"
                    value={note.value}
                    onChange={(event) => updateNote(index, 'value', event.target.value)}
                    placeholder="Value (e.g. Genevieve)"
                    className="min-w-0 flex-1 rounded border border-cream-200 px-2 py-1 text-sm"
                  />
                </div>
                <input
                  type="text"
                  value={note.detail}
                  onChange={(event) => updateNote(index, 'detail', event.target.value)}
                  placeholder="Detail (optional)"
                  className="w-full rounded border border-cream-200 px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSaved(false)
                    setNotes((current) => current.filter((_, i) => i !== index))
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove note
                </button>
              </div>
            ))}
            {stored < 3 && (
              <button
                type="button"
                onClick={() => {
                  setSaved(false)
                  setNotes((current) => [...current, { label: '', value: '', detail: '' }])
                }}
                className="text-xs font-medium text-jade-700 hover:underline"
              >
                + Add commissioner note
              </button>
            )}
          </div>
        </>
      )}
      <ErrorMsg msg={error} />
      <SuccessMsg msg={saved ? 'Reveal insights saved.' : null} />
      {loaded && (
        <div className="mt-3 flex items-center gap-3">
          <ActionBtn onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save reveal insights'}
          </ActionBtn>
          <span className="text-xs text-gray-500">{stored}/3 added</span>
        </div>
      )}
    </div>
  )
}

function EpisodePanel({
  episode,
  tokenEconomyEnabled,
  contestants,
  eventTypes,
  onUpdated,
}: {
  episode: Episode
  tokenEconomyEnabled: boolean
  contestants: Contestant[]
  eventTypes: ScoringEventType[]
  onUpdated: (ep: Episode) => void
}) {
  // Edit fields
  const [epNum, setEpNum] = useState(String(episode.episode_number))
  const [title, setTitle] = useState(episode.title ?? '')
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
        title: title.trim() === '' ? null : title.trim(),
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Episode #</label>
            <input
              type="number"
              value={epNum}
              onChange={(e) => setEpNum(e.target.value)}
              className="w-full border border-cream-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Air date</label>
            <input
              type="date"
              value={airDate}
              onChange={(e) => setAirDate(e.target.value)}
              className="w-full border border-cream-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Episode title"
              className="w-full border border-cream-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Ballot locks at (CT)</label>
            <input
              type="datetime-local"
              value={locksAt}
              onChange={(e) => setLocksAt(e.target.value)}
              className="w-full border border-cream-200 rounded px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max ballot votes</label>
            <input
              type="number"
              value={maxPicks}
              onChange={(e) => setMaxPicks(e.target.value)}
              className="w-full border border-cream-200 rounded px-2 py-1 text-sm"
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
          <p className="text-xs text-gray-500">Loading…</p>
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
                      className="border border-cream-200 rounded px-2 py-1 text-xs"
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
        <p className="text-xs text-gray-500 mt-2">Changes save automatically.</p>
      </div>

      {/* Scoring events */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-3">Scoring Events</p>
        {!eventsLoaded ? (
          <p className="text-xs text-gray-500">Loading…</p>
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
                      className="text-gray-500 hover:text-terracotta-500 text-xs disabled:opacity-40"
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
                className="border border-cream-200 rounded px-2 py-1 text-sm flex-1 min-w-0"
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
                className="border border-cream-200 rounded px-2 py-1 text-sm flex-1 min-w-0"
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
                className="w-16 border border-cream-200 rounded px-2 py-1 text-sm"
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

      {/* Import from survivoR (#132) */}
      {elimLoaded && eventsLoaded && episode.status !== 'scored' && (
        <ImportSection
          episode={episode}
          contestants={contestants}
          eventTypes={eventTypes}
          elims={elims}
          events={events}
          onApplied={({ elims: ae, events: av }) => {
            setElims((prev) => [...prev, ...ae])
            setEvents((prev) => [...prev, ...av])
          }}
        />
      )}

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
              Marks the episode complete
              {tokenEconomyEnabled && ' and grants the historical weekly token allocation'}.
              Scores compute live from eliminations + scoring events, so they can still
              be corrected afterwards.
            </p>
            <ErrorMsg msg={scoreError} />
            <SuccessMsg msg={scoreSuccess} />
            <ConfirmAction
              label="Review and score episode"
              confirmLabel="Score and publish results"
              impact={`This marks Episode ${episode.episode_number} scored and reveals results to the league. Confirm eliminations and scoring events first.`}
              onConfirm={scoreEpisode}
              busy={scoring}
            />
          </>
        )}
      </div>

      {episode.status === 'scored' && elimLoaded && (
        <EpisodeInsightEditor
          episode={episode}
          contestants={contestants}
          eliminations={elims}
        />
      )}
    </div>
  )
}

// ─── Episodes section ─────────────────────────────────────────────────────────

// Review-gated TVmaze episode proposal (#197)
interface EpisodeProposal {
  episodes: {
    episode_number: number
    name: string
    air_date: string
    picks_lock_at: string
    is_finale: boolean
    exists: boolean
  }[]
  source: string
}

/** Create a season's episodes from TVmaze's schedule (#197): real air dates,
 * picks_lock_at defaulting to the airstamp; the admin reviews then creates
 * through the normal episode endpoint. */
function EpisodeProposalSection({
  season,
  episodes,
  onCreated,
}: {
  season: Season
  episodes: Episode[]
  onCreated: (eps: Episode[]) => void
}) {
  const [tvmazeSeason, setTvmazeSeason] = useState('')
  const [proposal, setProposal] = useState<EpisodeProposal | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function load() {
    setSuccess(null)
    void run(setLoading, setError, async () => {
      const q = tvmazeSeason ? `?tvmaze_season=${tvmazeSeason}` : ''
      const p = await api.get<EpisodeProposal>(
        `/seasons/${season.id}/episode-proposal${q}`,
      )
      setProposal(p)
      // Already-created episode numbers default unchecked — creating them
      // again would 409.
      setChecked(
        new Set(p.episodes.filter((e) => !e.exists).map((e) => e.episode_number)),
      )
    })
  }

  function toggle(n: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  function apply() {
    if (!proposal) return
    void run(setApplying, setError, async () => {
      const created: Episode[] = []
      for (const e of proposal.episodes) {
        if (!checked.has(e.episode_number)) continue
        created.push(
          await api.post<Episode>(`/seasons/${season.id}/episodes`, {
            episode_number: e.episode_number,
            air_date: e.air_date,
            picks_lock_at: e.picks_lock_at,
            is_finale: e.is_finale,
            // TVmaze hands us the episode title; dropping it here is why
            // episodes created in bulk showed up untitled (#487).
            title: e.name || null,
          }),
        )
      }
      onCreated(
        [...episodes, ...created].sort((a, b) => a.episode_number - b.episode_number),
      )
      setProposal(null)
      setSuccess(`Created ${created.length} episode${created.length === 1 ? '' : 's'}.`)
    })
  }

  return (
    <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-3">
      <p className="text-xs font-semibold text-gray-500">Create episodes from TVmaze</p>
      {!proposal ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            placeholder="US season # (default: this season)"
            value={tvmazeSeason}
            onChange={(e) => setTvmazeSeason(e.target.value)}
            className="w-64 border border-cream-200 rounded px-2 py-1 text-sm"
          />
          <ActionBtn variant="secondary" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Load schedule'}
          </ActionBtn>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            {proposal.source} — review, uncheck anything wrong, then create.
            Ballots lock at air time; max votes come from the season&apos;s
            ballot vote schedule — adjust per episode afterward. Data:{' '}
            <a
              href="https://www.tvmaze.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              TVmaze
            </a>{' '}
            (CC BY-SA).
          </p>
          <div className="space-y-1">
            {proposal.episodes.map((e) => (
              <label key={e.episode_number} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked.has(e.episode_number)}
                  onChange={() => toggle(e.episode_number)}
                />
                <span className={e.exists ? 'text-gray-500' : 'text-gray-700'}>
                  Ep {e.episode_number}{e.name ? ` · ${e.name}` : ''} · {e.air_date} · locks{' '}
                  {utcToCentralLocal(e.picks_lock_at).replace('T', ' ')} CT
                  {e.is_finale && ' · finale'}
                  {e.exists && ' · already created'}
                </span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <ActionBtn onClick={apply} disabled={applying || checked.size === 0}>
              {applying
                ? 'Creating…'
                : `Create ${checked.size} episode${checked.size === 1 ? '' : 's'}`}
            </ActionBtn>
            <ActionBtn variant="secondary" onClick={() => setProposal(null)}>
              Cancel
            </ActionBtn>
          </div>
        </div>
      )}
      <ErrorMsg msg={error} />
      <SuccessMsg msg={success} />
    </div>
  )
}

function EpisodesSection({
  season,
  episodes,
  contestants,
  eventTypes,
  focusEpisodeId,
  onUpdated,
}: {
  season: Season
  episodes: Episode[]
  contestants: Contestant[]
  eventTypes: ScoringEventType[]
  focusEpisodeId?: string
  onUpdated: (eps: Episode[]) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(focusEpisodeId ?? null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [epNum, setEpNum] = useState('')
  const [airDate, setAirDate] = useState('')
  const [locksAt, setLocksAt] = useState('')
  // Blank = take the season's elimination picks schedule (#269).
  const [maxPicks, setMaxPicks] = useState('')
  const [isFinale, setIsFinale] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function addEpisode() {
    void run(setAdding, setAddError, async () => {
      const ep = await api.post<Episode>(`/seasons/${season.id}/episodes`, {
        episode_number: Number(epNum),
        air_date: airDate,
        picks_lock_at: centralLocalToUtc(locksAt),
        max_elimination_picks: maxPicks ? Number(maxPicks) : undefined,
        is_finale: isFinale,
      })
      onUpdated([...episodes, ep].sort((a, b) => a.episode_number - b.episode_number))
      setShowAddForm(false)
      setEpNum('')
      setAirDate('')
      setLocksAt('')
      setMaxPicks('')
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

  const statusBadge = (episode: Episode) => {
    const status = commissionerEpisodeLabel(episode)
    const cls =
      status === 'Scored'
        ? 'bg-jade-50 text-jade-700'
        : status === 'Scheduled'
          ? 'bg-blue-50 text-blue-700'
          : 'bg-gold-50 text-gold-800'
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{status}</span>
    )
  }

  return (
    <div className="space-y-2">
      {episodes.length === 0 && <Notice title="No episodes scheduled">Create the schedule from TVmaze or add the first episode manually.</Notice>}
      {episodes.map((ep) => (
        <div id={`episode-${ep.id}`} key={ep.id} className={`scroll-mt-24 p-4 bg-white border rounded-xl ${ep.id === focusEpisodeId ? 'border-forest-300 ring-1 ring-forest-100' : 'border-cream-200'}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <span className="font-medium text-gray-900">
                Ep {ep.episode_number}
                {ep.title && (
                  <span className="ml-1.5 font-normal text-gray-500 truncate max-w-[16rem] inline-block align-bottom">
                    · {ep.title}
                  </span>
                )}
              </span>
              {ep.is_finale && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-medium">
                  finale
                </span>
              )}
              {statusBadge(ep)}
              <span className="text-xs text-gray-500">Airs {ep.air_date}</span>
              <span className="text-xs text-gray-500">Locks {utcToCentralLocal(ep.picks_lock_at).replace('T', ' ')} CT</span>
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
              tokenEconomyEnabled={season.token_economy_enabled}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Episode #</label>
              <input
                type="number"
                value={epNum}
                onChange={(e) => setEpNum(e.target.value)}
                className="w-full border border-cream-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Air date</label>
              <input
                type="date"
                value={airDate}
                onChange={(e) => setAirDate(e.target.value)}
                className="w-full border border-cream-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ballot locks at (CT)</label>
              <input
                type="datetime-local"
                value={locksAt}
                onChange={(e) => setLocksAt(e.target.value)}
                className="w-full border border-cream-200 rounded px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Max ballot votes</label>
              <input
                type="number"
                placeholder="from schedule"
                value={maxPicks}
                onChange={(e) => setMaxPicks(e.target.value)}
                className="w-full border border-cream-200 rounded px-2 py-1 text-sm"
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
          className="w-full py-2 text-sm text-gray-500 border border-dashed border-cream-200 rounded-xl hover:border-gray-300 hover:text-gray-700 transition-colors"
        >
          + Add episode
        </button>
      )}

      <EpisodeProposalSection season={season} episodes={episodes} onCreated={onUpdated} />
    </div>
  )
}

// ─── Tokens section ───────────────────────────────────────────────────────────

function TokensSection({ season }: { season: Season }) {
  return (
    <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-2">
      <p className="text-sm font-medium text-gray-700">Historical weekly allocation</p>
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
    <div className="p-4 bg-white border border-cream-200 rounded-xl space-y-3 max-w-sm">
      <p className="text-xs text-gray-500">
        Share this code with new members — they enter it at /join to create their
        profile.
      </p>
      <input
        value={joinCode}
        onChange={(e) => setJoinCode(e.target.value)}
        className="w-full border border-cream-200 rounded-lg px-3 py-2 text-sm"
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

// ─── First season (#526) ─────────────────────────────────────────────────────

/** A league with zero seasons had no way in: `POST /seasons` has been
 * admin-guarded since #152 but nothing in the frontend ever called it, so
 * season one had to be POSTed by hand while /admin cold-started at ColdStart.
 *
 * Deliberately three fields. Every other column has a server default and is
 * editable in Season setup the moment the season exists, so asking for roster
 * size and lock episodes here would just duplicate that form. */
function CreateSeasonSection({ onCreated }: { onCreated: (season: Season) => void }) {
  const [name, setName] = useState('')
  const [seasonNumber, setSeasonNumber] = useState('')
  const [status, setStatus] = useState<Season['status']>('upcoming')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = name.trim() !== '' && Number(seasonNumber) > 0

  function submit() {
    if (!valid) return
    void run(setBusy, setError, async () => {
      onCreated(
        await api.post<Season>('/seasons', {
          name: name.trim(),
          season_number: Number(seasonNumber),
          status,
        }),
      )
    })
  }

  return (
    <div className="rounded-xl border border-cream-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="new-season-name" className="mb-1 block text-xs text-gray-500">
            Name
          </label>
          <input
            id="new-season-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Survivor 50: In the Hands of the Fans"
            className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="new-season-number" className="mb-1 block text-xs text-gray-500">
            Season number
          </label>
          <input
            id="new-season-number"
            type="number"
            min={1}
            value={seasonNumber}
            onChange={(e) => setSeasonNumber(e.target.value)}
            placeholder="50"
            className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">
            Practice seasons are numbered 100+. Drives the TVmaze episode lookup.
          </p>
        </div>
        <div>
          <label htmlFor="new-season-status" className="mb-1 block text-xs text-gray-500">
            Status
          </label>
          <select
            id="new-season-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Season['status'])}
            className="w-full rounded-lg border border-cream-200 px-3 py-2 text-sm"
          >
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div className="mt-3">
        <ActionBtn onClick={submit} disabled={busy || !valid}>
          {busy ? 'Creating…' : 'Create season'}
        </ActionBtn>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Roster size, locks, merge episode, and the ballot schedule take their defaults and are
        editable in Season setup once the season exists.
      </p>
      <ErrorMsg msg={error} />
    </div>
  )
}

export function AdminPage() {
  const { profile } = useAuth()
  const [season, setSeason] = useState<Season | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [eventTypes, setEventTypes] = useState<ScoringEventType[]>([])
  const [leagueSettings, setLeagueSettings] = useState<LeagueSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Season-scoped load, reused after #526's create form makes the first season
  // exist so the page doesn't render with the empty state the mount-time load
  // left behind.
  const loadSeason = useCallback(async (target: Season) => {
    setSeason(target)
    const [cs, eps, types, settings] = await Promise.all([
      api.get<Contestant[]>(`/seasons/${target.id}/contestants`),
      api.get<Episode[]>(`/seasons/${target.id}/episodes`),
      // Season-scoped since #170's snapshot; the global route is gone
      api.get<ScoringEventType[]>(`/seasons/${target.id}/scoring-event-types`),
      api.get<LeagueSettings>('/league-settings'),
    ])
    setContestants(cs)
    setEpisodes(eps.sort((a, b) => a.episode_number - b.episode_number))
    setEventTypes(types)
    setLeagueSettings(settings)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const active = await getActiveSeason()
        if (active) await loadSeason(active)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [loadSeason])

  if (loading) return <PageLoader />
  if (error) return <Notice tone="error" title="Could not load commissioner tools">{error}</Notice>

  if (!profile?.is_admin) {
    return <Notice tone="error" title="Commissioner access required">Your account is not authorized to manage the league. The server also enforces administrator permissions on every mutation.</Notice>
  }

  if (!season) {
    return (
      <div>
        <PageHeader
          eyebrow="Commissioner"
          title="Create the first season"
          description="This league has no seasons yet. Create one to open scheduling, cast setup, and scoring."
        />
        <CreateSeasonSection onCreated={(s) => void loadSeason(s)} />
      </div>
    )
  }

  const context = commissionerContext(season, episodes)
  const workflow = [
    { id: 'episodes', label: '1. Schedule & score' },
    { id: 'season-setup', label: '2. Season setup' },
    { id: 'cast-setup', label: '3. Cast setup' },
    { id: 'league-settings', label: '4. League access' },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="Commissioner"
        title="League operations"
        description="Schedule, review, score, and correct the active season. Changes here affect the whole league."
        meta={<span className="rounded-full bg-forest-50 px-3 py-1 font-medium text-forest-800">{season.name}</span>}
      />

      <section aria-labelledby="current-work-title" className={`rounded-2xl border p-5 sm:p-6 ${context.stage === 'review' ? 'border-gold-300 bg-gold-50' : context.stage === 'complete' ? 'border-jade-200 bg-jade-50' : 'border-forest-200 bg-forest-50'}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest-700">Current work</p>
        <h2 id="current-work-title" className="mt-1 font-display text-2xl tracking-wide text-forest-900">{context.title}</h2>
        <p className="mt-2 text-sm text-gray-700">{context.action}</p>
        {context.episode && (
          <a href={`#episode-${context.episode.id}`} className="mt-4 inline-flex rounded-lg bg-forest-700 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-800">
            Open Episode {context.episode.episode_number} →
          </a>
        )}
      </section>

      <nav aria-label="Commissioner workflow" className="sticky top-0 z-20 -mx-4 mt-5 overflow-x-auto border-b border-cream-200 bg-cream-100/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <ol className="flex min-w-max gap-2">
          {workflow.map((step) => <li key={step.id}><a href={`#${step.id}`} className="block rounded-full border border-cream-200 bg-white px-3 py-2 text-sm text-forest-700 hover:border-forest-300">{step.label}</a></li>)}
        </ol>
      </nav>

      <Section id="episodes" title="Episode operations" description="The active episode comes first: verify the schedule, enter results, review, then publish scoring.">
        <EpisodesSection
          season={season}
          episodes={episodes}
          contestants={contestants}
          eventTypes={eventTypes}
          focusEpisodeId={context.stage === 'review' ? context.episode?.id : undefined}
          onUpdated={setEpisodes}
        />
      </Section>

      <Section id="season-setup" title="Season setup" description="Configuration that controls locks, merge timing, and ballot capacity.">
        <SeasonSection season={season} onUpdated={setSeason} />
      </Section>

      <Section id="cast-setup" title={`Cast setup (${contestants.length})`} description="Add contestants and maintain names, placements, and photos.">
        <ContestantsSection
          seasonId={season.id}
          contestants={contestants}
          onUpdated={setContestants}
        />
      </Section>

      {season.token_economy_enabled && (
        <Section id="historical-tokens" title="Historical tokens" description="Legacy configuration for this season snapshot only.">
          <TokensSection season={season} />
        </Section>
      )}

      {leagueSettings && (
        <Section id="league-settings" title="League access" description="Control the join code shared with new league members.">
          <LeagueSettingsSection settings={leagueSettings} onUpdated={setLeagueSettings} />
        </Section>
      )}

      <Section id="loader-preview" title="Loading screen preview" description="Show the slide-puzzle loader full-screen to test it — it rarely stays up long enough to see.">
        <LoaderPreviewSection />
      </Section>

      <Section id="branding-compare" title="Branding" description="The rebrand at a glance — old identity next to new.">
        <BrandingCompareSection />
      </Section>
    </div>
  )
}

function BrandingCompareSection() {
  const marks = [
    { src: '/icon-tribalknowledge.webp', caption: 'Before', word: <span className="text-forest-800">TRIBAL KNOWLEDGE</span> },
    {
      src: '/icon-512.webp?v=20260830',
      caption: 'After',
      word: (
        <>
          <span className="text-forest-800">SNAKES</span>{' '}
          <span className="text-gold-700">AND</span>{' '}
          <span className="text-terracotta-500">RATS</span>
        </>
      ),
    },
  ]
  return (
    <div className="grid max-w-md grid-cols-2 gap-3">
      {marks.map((m) => (
        <figure key={m.src} className="flex flex-col items-center gap-2 rounded-xl border border-cream-200 bg-white p-4 text-center">
          <img src={m.src} alt="" width={72} height={72} className="size-[72px] rounded-2xl ring-1 ring-black/10" />
          <figcaption className="font-brand text-base font-bold leading-none tracking-wide">{m.word}</figcaption>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{m.caption}</span>
        </figure>
      ))}
    </div>
  )
}

// The four marks a preview can show: the new Snakes and Rats puzzle and the old
// fire-ring one, each in the light (unlocked) and dark (locked) theme. `tileSrc`
// undefined falls back to the theme's current art (the new mark).
const LOADER_VARIANTS = [
  { key: 'new-unlocked', label: 'New · Unlocked', theme: 'unlocked', tileSrc: undefined },
  { key: 'new-locked', label: 'New · Locked', theme: 'locked', tileSrc: undefined },
  { key: 'old-unlocked', label: 'Old · Unlocked', theme: 'unlocked', tileSrc: '/puzzle-firering-dark.webp' },
  { key: 'old-locked', label: 'Old · Locked', theme: 'locked', tileSrc: '/puzzle-firering-light.webp' },
] as const

function LoaderPreviewSection() {
  const [open, setOpen] = useState(false)
  return (
    <div className="p-4 bg-white border border-cream-200 rounded-xl space-y-3 max-w-sm">
      <ActionBtn onClick={() => setOpen(true)}>Preview loading screen</ActionBtn>
      {open && <LoaderPreviewOverlay onClose={() => setOpen(false)} />}
    </div>
  )
}

// Mirrors PageLoader: the 700ms hold + fade-in, so the preview shows exactly
// what a real cold-start load looks like. Once up, switch mark/theme and pull a
// fresh quote inline — no need to close back to the admin page.
function LoaderPreviewOverlay({ onClose }: { onClose: () => void }) {
  const [show, setShow] = useState(false)
  const [variantKey, setVariantKey] = useState<(typeof LOADER_VARIANTS)[number]['key']>('new-unlocked')
  // Bumped to remount the loader, which re-picks its random quote (the loader
  // freezes the quote at mount).
  const [quoteNonce, setQuoteNonce] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), LOADER_DELAY_MS)
    return () => clearTimeout(t)
  }, [])
  const variant = LOADER_VARIANTS.find((v) => v.key === variantKey) ?? LOADER_VARIANTS[0]
  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-auto">
      {show && (
        <div className="tk-loader-fade flex flex-1 flex-col [&>div]:flex-1">
          <SlidePuzzleLoader key={quoteNonce} theme={variant.theme} tileSrc={variant.tileSrc} />
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-2 bg-black/60 p-3 backdrop-blur">
        {LOADER_VARIANTS.map((v) => (
          <button
            key={v.key}
            onClick={() => setVariantKey(v.key)}
            aria-pressed={v.key === variantKey}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              v.key === variantKey
                ? 'bg-terracotta-500 text-white'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            {v.label}
          </button>
        ))}
        <button
          onClick={() => setQuoteNonce((n) => n + 1)}
          className="rounded-lg bg-forest-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-forest-700"
        >
          New quote
        </button>
        <button
          onClick={onClose}
          className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-forest-900 hover:bg-white"
        >
          Close
        </button>
      </div>
    </div>
  )
}
