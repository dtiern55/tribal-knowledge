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

/** Contestant photo with an initials fallback when no image is set (#54). */
export function ContestantAvatar({
  name,
  imageUrl,
  size = 'md',
}: {
  name: string
  imageUrl: string | null
  size?: keyof typeof sizeClass
}) {
  const base = `${sizeClass[size]} rounded-full shrink-0 object-cover`
  if (imageUrl) {
    return <img src={imageUrl} alt={name} className={base} />
  }
  return (
    <span
      className={`${base} bg-gray-200 text-gray-500 font-medium inline-flex items-center justify-center`}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}
