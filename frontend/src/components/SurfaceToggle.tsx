import { useEffect, useState } from 'react'

/**
 * TEMPORARY — preview control for #552.
 *
 * My Season's painted surface is forked between two treatments and the choice
 * is a feel call, not an argument, so the deploy preview ships both and lets
 * you flip between them. `?surface=panel` also works, and the choice sticks in
 * localStorage so it survives navigation.
 *
 * Delete this file, its CSS block, and the `data-surface` attribute once the
 * treatment is chosen.
 */
export type Surface = 'plaque' | 'panel'

const KEY = 'tk-surface-preview'

function initial(): Surface {
  const fromUrl = new URLSearchParams(window.location.search).get('surface')
  if (fromUrl === 'panel' || fromUrl === 'plaque') return fromUrl
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'panel' || saved === 'plaque') return saved
  } catch {
    // Private browsing can refuse storage; the default still works.
  }
  return 'plaque'
}

export function useSurface(): [Surface, (next: Surface) => void] {
  const [surface, setSurface] = useState<Surface>(initial)
  useEffect(() => {
    try {
      localStorage.setItem(KEY, surface)
    } catch {
      // See above.
    }
  }, [surface])
  return [surface, setSurface]
}

export function SurfaceToggle({
  value,
  onChange,
}: {
  value: Surface
  onChange: (next: Surface) => void
}) {
  return (
    <div
      className="surface-toggle"
      role="group"
      aria-label="Preview: My Season surface treatment"
    >
      {(['plaque', 'panel'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          className="surface-toggle__btn"
        >
          {option === 'plaque' ? 'Plaques' : 'One panel'}
        </button>
      ))}
    </div>
  )
}
