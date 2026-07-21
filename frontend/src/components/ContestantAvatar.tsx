function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const sizeClass = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-9 h-9 text-xs',
} as const

/**
 * Contestant photo with an initials fallback when no image is set (#54).
 *
 * When a tribe color is given (#212) the photo is framed by a buff — a solid
 * color ring at `sm`, a twisted-fabric ring at `md` (the diagonal stripe reads
 * as a rolled buff). The bright show-color stays contained to the buff so it
 * doesn't fight the app palette. `tribeName` becomes the hover title.
 */
export function ContestantAvatar({
  name,
  imageUrl,
  size = 'md',
  tribeColor = null,
  tribeName = null,
}: {
  name: string
  imageUrl: string | null
  size?: keyof typeof sizeClass
  tribeColor?: string | null
  tribeName?: string | null
}) {
  // object-top: cast photos are portraits; center-crop cuts off heads.
  const base = `${sizeClass[size]} rounded-full shrink-0 object-cover object-top`
  const inner = imageUrl ? (
    <img src={imageUrl} alt={name} className={base} />
  ) : (
    <span
      className={`${base} bg-gray-200 text-gray-500 font-medium inline-flex items-center justify-center`}
      aria-hidden
    >
      {initials(name)}
    </span>
  )

  if (!tribeColor) return inner

  const pad = size === 'sm' ? 2 : 3
  // Twisted-buff look at md: diagonal darker stripes over the tribe color.
  const twist =
    size === 'sm'
      ? undefined
      : 'repeating-linear-gradient(-45deg, rgba(0,0,0,.22) 0 2px, transparent 2px 5px)'
  return (
    <span
      className="relative inline-flex shrink-0 rounded-full"
      style={{ padding: pad, backgroundColor: tribeColor, backgroundImage: twist }}
      title={tribeName ?? undefined}
    >
      {inner}
    </span>
  )
}
