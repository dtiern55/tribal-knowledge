import type { CSSProperties } from 'react'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const sizeClass = {
  sm: 'w-6 h-6 text-[11px]',
  md: 'w-9 h-9 text-xs',
} as const

/**
 * Contestant photo with an initials fallback when no image is set (#54).
 *
 * When a tribe color is given (#212), a crisp 2.5px frame connects the
 * castaway to their tribe. `tribeName` becomes the hover title.
 *
 * `square` is the roster manifest's variant: a photograph affixed to a record
 * page reads as a print with a border, not as a round avatar. The tribe frame
 * follows that square shape.
 */
export function ContestantAvatar({
  name,
  imageUrl,
  size = 'md',
  tribeColor = null,
  tribeName = null,
  square = false,
}: {
  name: string
  imageUrl: string | null
  size?: keyof typeof sizeClass
  tribeColor?: string | null
  tribeName?: string | null
  square?: boolean
}) {
  // object-top: cast photos are portraits; center-crop cuts off heads.
  const shape = square ? 'rounded-[2px] ring-2 ring-white/85' : 'rounded-full'
  const base = `contestant-avatar ${sizeClass[size]} ${shape} shrink-0 border-solid object-cover object-top`
  const tribeStyle = {
    '--tribe-color': tribeColor ?? 'transparent',
    '--tribe-border-width': tribeColor ? '2.5px' : '0',
  } as CSSProperties
  const inner = imageUrl ? (
    <img src={imageUrl} alt={name} className={base} style={tribeStyle} title={tribeName ?? undefined} />
  ) : (
    <span
      className={`${base} bg-stone-200 text-stone-600 font-medium inline-flex items-center justify-center`}
      style={tribeStyle}
      title={tribeName ?? undefined}
      aria-hidden
    >
      {initials(name)}
    </span>
  )

  return inner
}
