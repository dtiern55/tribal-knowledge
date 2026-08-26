import { useEffect, useRef } from 'react'
import { ContestantAvatar, ELIMINATED_DIM } from './ContestantAvatar'

export interface DoublePickCandidate {
  contestantId: string
  name: string
  imageUrl: string | null
  tribeName: string | null
  tribeColor: string | null
  points: number | undefined
  eliminated: boolean
}

/**
 * Focused sheet for choosing a castaway to apply Double Castaway Points (#449).
 * Replaces the in-page "stage lighting" for this flow: a self-contained list
 * over a dimmed page can't leak the page's tab strip or the swapped-out
 * expander at its edges, and every candidate reads as a clear, tappable card.
 */
export function DoublePickSheet({
  candidates,
  onPick,
  onCancel,
  busy,
  error,
}: {
  candidates: DoublePickCandidate[]
  onPick: (contestantId: string) => void
  onCancel: () => void
  busy: boolean
  error: string | null
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="presentation">
      <div
        className="sheet-scrim absolute inset-0 bg-forest-900/60"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="double-pick-title"
        className="sheet-panel relative mx-auto flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl bg-cream-50 shadow-[0_-8px_40px_rgba(10,22,19,0.35)] outline-none"
      >
        <div className="flex items-center justify-between gap-3 rounded-t-2xl border-b border-terracotta-200 bg-terracotta-50 px-4 py-3">
          <h2
            id="double-pick-title"
            className="font-display text-sm font-semibold uppercase tracking-wide text-terracotta-800"
          >
            Choose a castaway to double
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-forest-700 underline underline-offset-2"
          >
            Cancel
          </button>
        </div>

        {error && (
          <p className="border-b border-terracotta-100 px-4 py-2 text-sm text-terracotta-600">
            {error}
          </p>
        )}

        <ul className="min-h-0 flex-1 divide-y divide-paper-line overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {candidates.map((c) => (
            <li key={c.contestantId}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPick(c.contestantId)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-forest-50 focus-visible:bg-forest-50 disabled:opacity-50"
              >
                <span className={`shrink-0 ${c.eliminated ? ELIMINATED_DIM : ''}`}>
                  <ContestantAvatar
                    name={c.name}
                    imageUrl={c.imageUrl}
                    tribeColor={c.tribeColor}
                    tribeName={c.tribeName}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-display text-base font-semibold uppercase tracking-wide text-gray-900">
                    {c.name}
                  </span>
                  {c.tribeName && (
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-gray-500">
                      <span
                        className="tribe-marker"
                        style={{ backgroundColor: c.tribeColor ?? undefined }}
                        aria-hidden="true"
                      />
                      {c.tribeName}
                    </span>
                  )}
                </span>
                <span className="ml-auto shrink-0 font-display text-sm font-semibold text-forest-700">
                  {c.points != null ? `${c.points > 0 ? '+' : ''}${c.points} pts` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
