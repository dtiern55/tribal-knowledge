import { useNavigate } from 'react-router'

export function SwipeNavBar({
  prev,
  next,
  prevLabel,
  nextLabel,
}: {
  prev?: string
  next?: string
  prevLabel?: string
  nextLabel?: string
}) {
  const navigate = useNavigate()
  if (!prev && !next) return null
  const cls =
    'flex-1 min-w-0 flex items-center gap-1 px-3 py-2 text-sm text-ocean-700' +
    ' border border-sand-200 rounded-lg bg-white hover:border-ocean-300' +
    ' disabled:opacity-0 disabled:pointer-events-none transition-colors'
  return (
    <div className="flex items-center gap-2 mt-8">
      <button
        onClick={() => prev && navigate(prev, { replace: true })}
        disabled={!prev}
        aria-label={prevLabel ? `Previous: ${prevLabel}` : 'Previous'}
        className={cls}
      >
        <span aria-hidden>←</span>
        <span className="truncate">{prevLabel ?? 'Previous'}</span>
      </button>
      <button
        onClick={() => next && navigate(next, { replace: true })}
        disabled={!next}
        aria-label={nextLabel ? `Next: ${nextLabel}` : 'Next'}
        className={`${cls} justify-end`}
      >
        <span className="truncate">{nextLabel ?? 'Next'}</span>
        <span aria-hidden>→</span>
      </button>
    </div>
  )
}
