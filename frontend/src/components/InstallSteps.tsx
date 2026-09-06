import { useEffect, useState } from 'react'
import {
  installAvailable,
  isAndroid,
  isInstalled,
  isIos,
  onInstallAvailable,
  promptInstall,
} from '../lib/install'
import { DownloadIcon, ShareIcon } from './icons'

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

/** The install offer on the front door, so a player can put the app on their
 * home screen before they even have an account. Same gate as the drawer and
 * Profile: nothing once installed or where there's no path to it. */
export function InstallOffer() {
  const [canPrompt, setCanPrompt] = useState(installAvailable())
  useEffect(() => onInstallAvailable(() => setCanPrompt(true)), [])
  if (isInstalled() || (!canPrompt && !isIos() && !isAndroid())) return null
  return (
    <div className="mt-5 border-t border-cream-200 pt-4 text-xs text-gray-500">
      <span className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-700">
        <DownloadIcon />
        Get the app
      </span>
      {canPrompt ? (
        <button
          type="button"
          onClick={() => void promptInstall()}
          className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-forest-200 bg-white px-4 py-2 text-sm font-semibold text-forest-700 hover:bg-cream-100"
        >
          Install app
        </button>
      ) : (
        <InstallSteps />
      )}
    </div>
  )
}
