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
 *
 * Consecutive loaders read as one (#698). On a cold open the route guard's
 * "Restoring your session…" loader is replaced, in the same React commit, by
 * the page's own loader while it fetches. Without a handoff that second
 * loader started its own hold, fade, and quote — two loading screens with a
 * cut between them. Instead the outgoing loader leaves its start time behind
 * (the puzzle leaves its board and quote, see SlidePuzzleLoader) and the
 * incoming one picks up the same clock: already past the hold, no fade,
 * same quote.
 */
// Held back this long so a fast load never flashes the loader; the admin
// preview reuses it so it behaves exactly like the real thing.
export const LOADER_DELAY_MS = 700

// When the loader that is currently mounted started. A loader that mounts
// while this is set (the outgoing one has rendered its replacement but not
// yet unmounted) continues from that time instead of starting over.
let liveSince: number | null = null

export function PageLoader({
  label = 'Loading',
  delayMs = LOADER_DELAY_MS,
}: {
  label?: string
  delayMs?: number
}) {
  const [since] = useState(() => liveSince ?? Date.now())
  const [show, setShow] = useState(() => Date.now() - since >= delayMs)
  // Fade in unless this loader is continuing one that was already on screen.
  const [fade] = useState(!show)

  useEffect(() => {
    liveSince = since
    return () => {
      liveSince = null
    }
  }, [since])

  useEffect(() => {
    if (show) return
    const t = setTimeout(() => setShow(true), Math.max(0, delayMs - (Date.now() - since)))
    return () => clearTimeout(t)
  }, [delayMs, since, show])

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
    <div className={fade ? 'tk-loader-fade' : undefined}>
      <SlidePuzzleLoader theme={theme} label={label} scene={false} resume />
    </div>
  )
}
