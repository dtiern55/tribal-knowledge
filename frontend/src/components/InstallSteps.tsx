import { isIos } from '../lib/install'
import { ShareIcon } from './icons'

/** Manual add-to-home-screen steps for browsers that never fire
 * beforeinstallprompt: every iOS browser, and Firefox on Android. */
export function InstallSteps() {
  if (isIos()) {
    return (
      <>
        In Safari, tap{' '}
        <span className="inline-flex items-center gap-1 font-medium">
          Share <ShareIcon className="h-4 w-4" />
        </span>
        , then <span className="font-medium">Add to Home Screen</span>.
      </>
    )
  }
  return (
    <>
      Open the browser menu (⋮), then tap <span className="font-medium">Install</span> or{' '}
      <span className="font-medium">Add to Home screen</span>.
    </>
  )
}
