import { useEffect, useState } from 'react'
import { LOADER_HANDOFF_MS, SlidePuzzleLoader } from './SlidePuzzleLoader'

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
 * "Restoring your session…" loader is replaced by the page's own loader while
 * it fetches. Without a handoff that second loader started its own hold, fade,
 * and quote — two loading screens with a cut between them. Instead the outgoing
 * loader leaves its start time behind (the puzzle leaves its board and quote,
 * see SlidePuzzleLoader) and the incoming one picks up the same clock: already
 * past the hold, no fade, same quote. The clock outlives the unmount by
 * LOADER_HANDOFF_MS, so the two loaders need not swap in a single commit — a
 * page that lands and re-enters its own loading state a commit later (what a
 * lock flip does to My Season, since the open episode moves) continues the
 * loader it was already showing instead of cutting to a fresh one.
 *
 * The board follows the shell's open/locked theme live rather than freezing it
 * at mount: a flip mid-load used to leave the puzzle in the old wood until some
 * unrelated re-render snapped it over. Now it cross-fades as the shell does.
 */
// Held back this long so a fast load never flashes the loader; the admin
// preview reuses it so it behaves exactly like the real thing.
export const LOADER_DELAY_MS = 700

// When the loader that is currently mounted started, kept for
// LOADER_HANDOFF_MS past its unmount. A loader that mounts while this is set
// continues from that time instead of starting over.
let liveSince: number | null = null
let sinceExpiry: ReturnType<typeof setTimeout> | undefined

// The app's global open/locked signal (Layout keeps it on <html>).
function shellTheme(): 'locked' | 'unlocked' {
  return document.documentElement.classList.contains('locked-night') ? 'locked' : 'unlocked'
}

/** The shell theme, watched rather than sampled: the loader is the one thing
 *  on screen while the lock state is being resolved, so it is exactly the
 *  moment the class is most likely to flip underneath it. */
function useShellTheme() {
  const [theme, setTheme] = useState(shellTheme)
  useEffect(() => {
    const sync = () => setTheme(shellTheme())
    sync() // the class can flip between first render and this effect
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

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
  const theme = useShellTheme()

  useEffect(() => {
    clearTimeout(sinceExpiry)
    liveSince = since
    return () => {
      sinceExpiry = setTimeout(() => {
        liveSince = null
      }, LOADER_HANDOFF_MS)
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
  return (
    <div className={fade ? 'tk-loader-fade' : undefined}>
      <SlidePuzzleLoader theme={theme} label={label} scene={false} resume />
    </div>
  )
}
