import { useEffect, useState } from 'react'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

export function ContestantPortrait({
  name,
  imageUrl,
  crop = 'portrait',
  className = '',
}: {
  name: string
  imageUrl: string | null
  crop?: 'portrait' | 'card'
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [imageUrl])

  const aspect = crop === 'card' ? 'aspect-[5/4]' : 'aspect-[4/5]'
  const classes = `${aspect} w-full overflow-hidden bg-sand-100 ${className}`
  if (!imageUrl || failed) {
    return (
      <div
        className={`${classes} flex items-center justify-center bg-gradient-to-br from-sand-100 to-sand-200 text-3xl font-semibold text-ocean-700`}
        role="img"
        aria-label={`No photo available for ${name}`}
      >
        <span aria-hidden>{initials(name)}</span>
      </div>
    )
  }

  return (
    <div className={classes}>
      <img
        src={imageUrl}
        alt={`${name} portrait`}
        className="h-full w-full object-cover object-top"
        onError={() => setFailed(true)}
      />
    </div>
  )
}
