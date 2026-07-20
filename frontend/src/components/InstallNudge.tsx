import { useEffect, useState } from 'react'
import {
  dismissInstallNudge,
  installAvailable,
  installNudgePending,
  isInstalled,
  isIos,
  onInstallAvailable,
  promptInstall,
} from '../lib/install'

/** One-time dismissible banner nudging new members to install the PWA (#184).
 * Shows only while the flag armed at join is pending, and only on platforms
 * where we can actually help (native prompt, or iOS Safari instructions). */
export function InstallNudge() {
  const [dismissed, setDismissed] = useState(false)
  const [canPrompt, setCanPrompt] = useState(installAvailable())
  useEffect(() => onInstallAvailable(() => setCanPrompt(true)), [])

  if (dismissed || !installNudgePending() || isInstalled() || (!canPrompt && !isIos()))
    return null

  const dismiss = () => {
    dismissInstallNudge()
    setDismissed(true)
  }

  return (
    <div className="bg-ocean-50 border-b border-ocean-100">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-3 text-sm text-ocean-900">
        <span className="flex-1">
          {canPrompt ? (
            <>Get Tribal Knowledge on your home screen — fullscreen, one tap away.</>
          ) : (
            <>
              Add Tribal Knowledge to your home screen: tap{' '}
              <span className="font-medium">Share</span> →{' '}
              <span className="font-medium">Add to Home Screen</span> in Safari.
            </>
          )}
        </span>
        {canPrompt && (
          <button
            onClick={() => {
              void promptInstall().then(dismiss)
            }}
            className="shrink-0 px-3 py-1 bg-ocean-600 text-white text-xs font-medium rounded-lg hover:bg-ocean-700 transition-colors"
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 text-ocean-400 hover:text-ocean-600 text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )
}
