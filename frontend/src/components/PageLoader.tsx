import { useEffect, useState } from 'react'
import { Torch } from './Torch'

/**
 * Full-page loading state (#56): a flickering lit torch instead of plain
 * "Loading…" grey text.
 *
 * Held back for `delayMs` so a fast load never flashes the torch — pages
 * return `<PageLoader />` while loading, so if the data lands first the
 * component unmounts before the timer fires and nothing shows. The delay is
 * tuned to sit in the gap between a warm in-app navigation (typically a few
 * hundred ms — no torch, it would just flash) and a genuine Fly cold start
 * (multiple seconds — the torch is worth showing). Flicker is CSS
 * (.torch-flicker), reduced-motion aware.
 */
export function PageLoader({
  label = 'Loading…',
  delayMs = 700,
}: {
  label?: string
  delayMs?: number
}) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delayMs)
    return () => clearTimeout(t)
  }, [delayMs])

  if (!show) return null
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
      <Torch lit className="torch-flicker w-10 h-14" />
      <p className="text-sm">{label}</p>
    </div>
  )
}
