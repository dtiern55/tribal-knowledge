import { useEffect, useState } from 'react'
import { SlidePuzzleLoader } from './SlidePuzzleLoader'

/**
 * Full-page loading state (#56/#439): a Survivor sliding-puzzle of the
 * Snakes and Rats mark, themed to the app's open/locked state.
 *
 * Held back for `delayMs` so a fast load never flashes the loader — pages
 * return `<PageLoader />` while loading, so if the data lands first the
 * component unmounts before the timer fires and nothing shows. The delay is
 * tuned to sit in the gap between a warm in-app navigation (typically a few
 * hundred ms — no loader, it would just flash) and a genuine Fly cold start
 * (multiple seconds — the loader is worth showing). Motion is timer-driven
 * and reduced-motion aware.
 */
// Held back this long so a fast load never flashes the loader; the admin
// preview reuses it so it behaves exactly like the real thing.
export const LOADER_DELAY_MS = 700

export function PageLoader({
  label = 'Loading',
  delayMs = LOADER_DELAY_MS,
}: {
  label?: string
  delayMs?: number
}) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delayMs)
    return () => clearTimeout(t)
  }, [delayMs])

  // Every page renders this while it fetches, which makes it the one place
  // that knows the app is mid-load — so it says so on <html>. The ballot's
  // room light reads it to hold the dark until the next page has landed.
  useEffect(() => {
    document.documentElement.classList.add('page-loading')
    return () => document.documentElement.classList.remove('page-loading')
  }, [])

  if (!show) return null
  // The locked-night class is the app's global open/locked signal (Layout).
  const theme = document.documentElement.classList.contains('locked-night') ? 'locked' : 'unlocked'
  return (
    <div className="tk-loader-fade">
      <SlidePuzzleLoader theme={theme} label={label} />
    </div>
  )
}
