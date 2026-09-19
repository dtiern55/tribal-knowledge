import { useRef, useState } from 'react'
import { ContestantAvatar } from './ContestantAvatar'
import { moveToTribe, type DraftTribe } from '../lib/watchTracker'
import type { CastMember } from '../types'

// Starting colors so a new tribe needs no picking; the swatch changes them.
const TRIBE_COLORS = ['#1f6fb2', '#e0b020', '#c2412d', '#2a9d4b', '#7b3fa0', '#e07a1f']

/** Drag faces into tribes while watching the premiere (#737). A tap-then-tap
 *  also works: tap a face, then tap the tribe it goes to. */
export function TribeAssigner({
  cast,
  tribes,
  onChange,
  published,
  publishing,
  onPublish,
}: {
  cast: CastMember[]
  tribes: DraftTribe[]
  onChange: (tribes: DraftTribe[]) => void
  published: boolean
  publishing: boolean
  onPublish: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [ghost, setGhost] = useState<{ c: CastMember; x: number; y: number } | null>(null)
  const start = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null)

  // Two empty tribes to drop into until the first one is added.
  const zones = tribes.length
    ? tribes
    : [0, 1].map((i) => ({ name: '', color: TRIBE_COLORS[i], members: [] as string[] }))
  const byId = new Map(cast.map((c) => [c.id, c]))
  const placed = new Set(zones.flatMap((t) => t.members))
  const pool = cast.filter((c) => !placed.has(c.id))

  const move = (id: string, to: number | null) => {
    onChange(moveToTribe(zones, id, to))
    setSelected(null)
  }
  const edit = (i: number, patch: Partial<DraftTribe>) =>
    onChange(zones.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const addTribe = () =>
    onChange([...zones, { name: '', color: TRIBE_COLORS[zones.length % TRIBE_COLORS.length], members: [] }])
  const removeTribe = (i: number) => onChange(zones.filter((_, j) => j !== i))

  const face = (c: CastMember) => (
    <button
      key={c.id}
      type="button"
      aria-pressed={selected === c.id}
      aria-label={`${c.name}${selected === c.id ? ', selected' : ''}`}
      // touch-none: the finger drags the face instead of scrolling the page.
      className={`flex w-16 touch-none select-none flex-col items-center gap-1 rounded-lg p-1 ${
        selected === c.id ? 'ring-2 ring-terracotta-600' : ''
      } ${ghost?.c.id === c.id ? 'opacity-30' : ''}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { id: c.id, x: e.clientX, y: e.clientY, moved: false }
      }}
      onPointerMove={(e) => {
        const s = start.current
        if (!s || s.id !== c.id) return
        if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 6) return
        s.moved = true
        setGhost({ c, x: e.clientX, y: e.clientY })
        // Scrolling is off while dragging, so nudge the page near its edges to
        // reach a tribe below the fold on a phone.
        if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12)
        else if (e.clientY < 60) window.scrollBy(0, -12)
      }}
      onPointerUp={(e) => {
        const s = start.current
        if (!s?.moved) return
        const zone = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-zone]')?.dataset.zone
        if (zone != null) move(c.id, zone === 'pool' ? null : Number(zone))
        setGhost(null)
      }}
      onPointerCancel={() => {
        start.current = null
        setGhost(null)
      }}
      onClick={(e) => {
        // The zone's own click would otherwise move the selection into it.
        e.stopPropagation()
        const dragged = start.current?.moved
        start.current = null
        if (!dragged) setSelected((s) => (s === c.id ? null : c.id))
      }}
    >
      <ContestantAvatar name={c.name} imageUrl={c.image_url} size="md" />
      <span className="w-full truncate text-center text-xs text-forest-900">{c.name}</span>
    </button>
  )

  const unnamed = zones.some((t) => !t.name.trim())
  const status = published
    ? 'Published. Every player sees these tribes.'
    : pool.length
      ? `${pool.length} still to place`
      : unnamed
        ? 'Name every tribe to publish'
        : 'Ready to publish'

  return (
    <div>
      <p className="text-sm text-stone-500">
        Drag each face into a tribe, or tap a face then tap its tribe. The tracker groups by these right away;
        players see them only when you publish.
      </p>

      <div
        data-zone="pool"
        onClick={() => selected && move(selected, null)}
        className="mt-3 flex min-h-20 flex-wrap gap-1 rounded-xl border border-dashed border-cream-300 bg-cream-50 p-2"
      >
        {pool.length ? pool.map(face) : <span className="m-auto text-sm text-stone-500">Everyone is placed</span>}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {zones.map((t, i) => (
          <div
            key={i}
            data-zone={i}
            onClick={() => selected && move(selected, i)}
            className="overflow-hidden rounded-xl border-2 bg-white"
            style={{ borderColor: t.color }}
          >
            <div className="flex items-center gap-2 bg-cream-50 px-3 py-2">
              <input
                type="color"
                value={t.color}
                onChange={(e) => edit(i, { color: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                aria-label="Tribe color"
                className="h-7 w-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <input
                value={t.name}
                onChange={(e) => edit(i, { name: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                placeholder="Tribe name"
                aria-label="Tribe name"
                className="min-w-0 flex-1 rounded border border-cream-200 bg-white px-2 py-1 font-display font-bold text-forest-900"
              />
              <span className="text-sm text-stone-500">{t.members.length}</span>
              {zones.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeTribe(i)
                  }}
                  aria-label="Remove tribe"
                  className="px-1 text-lg text-stone-500"
                >
                  ×
                </button>
              )}
            </div>
            <div className="flex min-h-24 flex-wrap gap-1 p-2">
              {t.members.map((id) => byId.get(id)).filter((c): c is CastMember => c != null).map(face)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={addTribe} className="min-h-11 rounded-lg border border-stone-200 px-4 text-sm font-semibold text-forest-700">
          Add tribe
        </button>
        <button
          type="button"
          onClick={onPublish}
          disabled={published || publishing || pool.length > 0 || unnamed}
          className="min-h-11 rounded-lg bg-terracotta-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {publishing ? 'Publishing…' : 'Publish tribes'}
        </button>
        <span className="text-sm text-stone-500">{status}</span>
      </div>

      {ghost && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2" style={{ left: ghost.x, top: ghost.y }}>
          <ContestantAvatar name={ghost.c.name} imageUrl={ghost.c.image_url} size="lg" />
        </div>
      )}
    </div>
  )
}
